const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { getUserWallet } = require('../walletManager');

const ROOT_RPC = 'wss://porcini.rootnet.app/archive/ws';
const DECIMALS = 6;

const swapSessions = new Map();

const ASSET_OPTIONS = {
  ROOT: 1,
  XRP: 2,
  ASTO: 17508,
  SYLO: 3172,
};

const ASSET_LIST_MESSAGE = Object.entries(ASSET_OPTIONS)
  .map(([name, id]) => `${name} - ${id}`)
  .join('\n');

async function handleSwap(ctx) {
  const userId = ctx.from.id.toString();
  const wallet = getUserWallet(userId);

  if (!wallet) return ctx.reply("❌ No wallet found. Use /start first.");

  swapSessions.set(userId, { step: 'assetIn', wallet });
  return ctx.reply(`💱 Choose the *token to swap from* (asset A):\n\n${ASSET_LIST_MESSAGE}`, { parse_mode: 'Markdown' });
}

async function swapMiddleware(ctx, next) {
  const userId = ctx.from.id.toString();
  const session = swapSessions.get(userId);
  const msg = ctx.message?.text;

  if (!session || !msg || msg.startsWith('/')) return next();

  try {
    switch (session.step) {
      case 'assetIn':
        session.assetIn = parseInt(msg);
        if (!Object.values(ASSET_OPTIONS).includes(session.assetIn))
          return ctx.reply('❌ Invalid asset ID. Choose from:\n' + ASSET_LIST_MESSAGE);
        session.step = 'amount';
        return ctx.reply("🔢 Enter the amount of asset A to swap:");

      case 'amount':
        const amount = parseFloat(msg);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ Invalid amount.');
        session.amount = amount;
        session.amountRaw = BigInt(amount * 10 ** DECIMALS);
        session.step = 'assetOut';
        return ctx.reply(`💱 Choose the *token to receive* (asset B):\n\n${ASSET_LIST_MESSAGE}`, { parse_mode: 'Markdown' });

      case 'assetOut':
        session.assetOut = parseInt(msg);
        if (!Object.values(ASSET_OPTIONS).includes(session.assetOut))
          return ctx.reply('❌ Invalid asset ID. Choose from:\n' + ASSET_LIST_MESSAGE);
        session.step = 'confirm';
        swapSessions.set(userId, session);
        return ctx.reply(
          `🔁 Confirm Swap:\n\n` +
          `Swap ${session.amount} units\n` +
          `From asset #${session.assetIn} → To asset #${session.assetOut}\n\n` +
          `Reply with "confirm" or "cancel"`
        );

      case 'confirm':
        if (msg.toLowerCase() === 'confirm') {
          await executeSwap(ctx, session);
          swapSessions.delete(userId);
        } else {
          ctx.reply('❌ Swap cancelled.');
          swapSessions.delete(userId);
        }
        break;
    }
  } catch (err) {
    console.error('Swap error:', err);
    ctx.reply(`❌ Swap failed: ${err.message}`);
    swapSessions.delete(userId);
  }

  return next();
}

async function executeSwap(ctx, session) {
  const { wallet, amountRaw, assetIn, assetOut } = session;

  const api = await ApiPromise.create({ provider: new WsProvider(ROOT_RPC) });
  const keyring = new Keyring({ type: 'ethereum' });
  const sender = keyring.addFromUri(wallet.mnemonic);

  const amountOutMin = BigInt(amountRaw * 95n / 100n); // 5% slippage
  const path = [assetIn, assetOut];
  const to = sender.address;
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const tx = api.tx.dex.swapWithExactSupply(
    amountRaw,
    amountOutMin,
    path,
    to,
    deadline
  );

  await ctx.reply('⏳ Sending swap transaction...');
  const unsub = await tx.signAndSend(sender, ({ status }) => {
    if (status.isInBlock) {
      ctx.reply(`✅ Swap included in block: ${status.asInBlock}`);
      unsub();
      api.disconnect();
    }
  });
}

module.exports = handleSwap;
module.exports.swapMiddleware = swapMiddleware;
