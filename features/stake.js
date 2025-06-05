const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { getUserWallet } = require('../walletManager');

const RPC = 'wss://porcini.rootnet.app/archive/ws';
const DECIMALS = 6;

const ASSET_IDS = {
  ROOT: 1,
  XRP: 2,
  ASTO: 17508,
  SYLO: 3172
};

const stakeSessions = new Map();

function format(amount) {
  return (Number(amount) / 10 ** DECIMALS).toFixed(6);
}

function parseToRaw(amount) {
  return BigInt(Math.floor(parseFloat(amount) * 10 ** DECIMALS));
}

async function handleStake(ctx) {
  const userId = ctx.from.id.toString();
  const wallet = getUserWallet(userId);
  if (!wallet) return ctx.reply('❌ No wallet found. Use /start first.');

  stakeSessions.set(userId, { step: 'token', wallet });

  const list = Object.entries(ASSET_IDS)
    .map(([name, id]) => `${name} - ${id}`)
    .join('\n');

  return ctx.reply(`📥 *Stake Tokens*\n\nChoose a token to stake:\n\n${list}`, {
    parse_mode: 'Markdown'
  });
}

async function stakeMiddleware(ctx, next) {
  const userId = ctx.from.id.toString();
  const session = stakeSessions.get(userId);
  const msg = ctx.message?.text;

  if (!session || !msg || msg.startsWith('/')) return next();

  try {
    const api = await ApiPromise.create({ provider: new WsProvider(RPC) });
    const keyring = new Keyring({ type: 'ethereum' });
    const sender = keyring.addFromUri(session.wallet.mnemonic);

    switch (session.step) {
      case 'token': {
        const tokenId = parseInt(msg);
        if (!Object.values(ASSET_IDS).includes(tokenId)) {
          return ctx.reply('❌ Invalid token ID. Try again.');
        }

        session.tokenId = tokenId;
        session.tokenSymbol = Object.keys(ASSET_IDS).find(k => ASSET_IDS[k] === tokenId);
        session.step = 'amount';

        const address = sender.address;
        let balance;
        if (tokenId === ASSET_IDS.ROOT) {
          balance = (await api.query.system.account(address)).data.free;
        } else {
          const res = await api.query.assets.account(tokenId, address);
          balance = res.isSome ? res.unwrap().balance : 0n;
        }

        session.balance = balance;
        stakeSessions.set(userId, session);

        return ctx.reply(
          `✅ Selected: ${session.tokenSymbol} (#${tokenId})\n💰 Balance: ${format(balance)} ${session.tokenSymbol}\n\nEnter amount to stake:`
        );
      }

      case 'amount': {
        const raw = parseToRaw(msg);
        if (raw <= 0n) return ctx.reply('❌ Invalid amount. Must be greater than 0.');

        if (raw > session.balance) {
          return ctx.reply(`❌ Not enough balance. You only have ${format(session.balance)} ${session.tokenSymbol}`);
        }

        session.amount = raw;
        session.step = 'confirm';
        stakeSessions.set(userId, session);

        return ctx.reply(
          `📄 Staking Summary\n\nToken: ${session.tokenSymbol} (#${session.tokenId})\nAmount: ${format(raw)} ${session.tokenSymbol}\n\nType "confirm" to stake or "cancel" to abort.`
        );
      }

      case 'confirm': {
        if (msg.toLowerCase() === 'cancel') {
          stakeSessions.delete(userId);
          return ctx.reply('❌ Staking cancelled.');
        }

        if (msg.toLowerCase() !== 'confirm') {
          return ctx.reply('❓ Please type "confirm" or "cancel".');
        }

        const { tokenId, amount } = session;
        const tx = tokenId === ASSET_IDS.ROOT
          ? api.tx.staking.bond(amount, 'Staked')
          : api.tx.assets.transfer(tokenId, sender.address, amount); // Placeholder fallback

        await ctx.reply('⏳ Sending staking transaction...');
        const unsub = await tx.signAndSend(sender, ({ status }) => {
          if (status.isInBlock) {
            ctx.reply(`✅ Staked successfully in block: ${status.asInBlock}`);
            unsub();
            api.disconnect();
          }
        });

        stakeSessions.delete(userId);
        break;
      }
    }
  } catch (err) {
    console.error('Stake error:', err);
    await ctx.reply(`❌ Staking failed: ${err.message}`);
    stakeSessions.delete(ctx.from.id.toString());
  }

  return next();
}

module.exports = handleStake;
module.exports.stakeMiddleware = stakeMiddleware;
