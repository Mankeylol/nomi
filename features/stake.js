// features/swap.js
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { getUserWallet } = require('../walletManager');
const { Markup } = require('telegraf');

const ROOT_ENDPOINT = 'wss://porcini.rootnet.app/ws'; // testnet
const DECIMALS = 1_000_000;

const stakeSessions = new Map();

async function handleStake(ctx) {
  const userId = ctx.from.id.toString();
  const wallet = getUserWallet(userId);

  if (!wallet) {
    await ctx.reply('❌ You need to /start and create a wallet first.');
    return;
  }

  stakeSessions.set(userId, {
    step: 'awaiting_amount',
    wallet,
  });

  await ctx.reply(
    `🪙 How much ROOT would you like to stake?\n\nEnter the amount (e.g., 500):`,
    Markup.inlineKeyboard([
      [Markup.button.callback('❌ Cancel', 'cancel_stake')],
    ])
  );
}

async function handleStakeStep(ctx) {
  const userId = ctx.from.id.toString();
  const session = stakeSessions.get(userId);
  if (!session || session.step !== 'awaiting_amount') return;

  const input = ctx.message.text.trim();
  const amount = parseFloat(input);

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Enter a positive number (e.g., 100.5).');
    return;
  }

  session.amount = amount;
  session.amountRaw = BigInt(Math.floor(amount * DECIMALS));
  session.step = 'awaiting_confirmation';
  stakeSessions.set(userId, session);

  await ctx.reply(
    `✅ You’re about to stake *${amount} ROOT*.\nDo you want to proceed?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirm', 'confirm_stake')],
        [Markup.button.callback('❌ Cancel', 'cancel_stake')],
      ]),
    }
  );
}

async function executeStake(ctx) {
  const userId = ctx.from.id.toString();
  const session = stakeSessions.get(userId);

  if (!session || !session.amount || !session.wallet) {
    await ctx.reply('⚠️ No active stake session found. Start again with /stake.');
    return;
  }

  const { amountRaw, wallet } = session;

  let api;
  try {
    await ctx.reply('⏳ Connecting to the network and submitting stake transaction...');
    api = await ApiPromise.create({ provider: new WsProvider(ROOT_ENDPOINT) });

    const keyring = new Keyring({ type: 'ethereum' });
    const signer = keyring.addFromUri(wallet.mnemonic);

const tx = api.tx.staking.bond(
  signer.address,   // controller = sender
  amountRaw,
  'Staked'
);

    const unsub = await tx.signAndSend(signer, ({ status, dispatchError, txHash }) => {
      if (status.isInBlock) {
        if (dispatchError) {
          ctx.reply(`❌ Transaction failed: ${dispatchError.toString()}`);
        } else {
          ctx.reply(
            `✅ Staked *${session.amount} ROOT* successfully!\n` +
            `🔗 Tx Hash: \`${txHash.toHex()}\``,
            { parse_mode: 'Markdown' }
          );
        }
        unsub();
        stakeSessions.delete(userId);
      }
    });
  } catch (err) {
    console.error('Stake error:', err);
    await ctx.reply('❌ Error submitting transaction. Try again later.');
    stakeSessions.delete(userId);
  } finally {
    if (api) await api.disconnect();
  }
}

function stakeMiddleware(ctx, next) {
  const userId = ctx.from.id.toString();
  const session = stakeSessions.get(userId);

  if (
    session &&
    session.step === 'awaiting_amount' &&
    ctx.message &&
    ctx.message.text &&
    !ctx.message.text.startsWith('/')
  ) {
    return handleStakeStep(ctx);
  }

  return next();
}

module.exports = {
  handleStake,
  stakeMiddleware,
  executeStake,
};