// send.js
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { getUserWallet } = require('../walletManager');
const { Markup } = require('telegraf');

const RPC = 'wss://porcini.rootnet.app/archive/ws';
const DECIMALS = 6;

const ASSET_IDS = {
  ROOT: 1,
  XRP: 2,
  ASTO: 17508,
  SYLO: 3172
};

const userSessions = new Map();

function format(amount) {
  return (Number(amount) / 10 ** DECIMALS).toFixed(6);
}

function parseToRaw(amount) {
  return BigInt(Math.floor(parseFloat(amount) * 10 ** DECIMALS));
}

async function handleSend(ctx) {
  const userId = ctx.from.id.toString();
  const wallet = getUserWallet(userId);
  if (!wallet) return ctx.reply("❌ No wallet found. Use /start first.");

  userSessions.set(userId, { step: 'token', wallet });

  const list = Object.entries(ASSET_IDS)
    .map(([name, id]) => `${name} - ${id}`)
    .join('\n');

  await ctx.reply(`💸 *Send Tokens*\n\nChoose a token:\n\n${list}`, {
    parse_mode: 'Markdown'
  });
}

const sendMiddleware = async (ctx, next) => {
  const userId = ctx.from.id.toString();
  const session = userSessions.get(userId);
  const msg = ctx.message?.text;

  if (!session || !msg || msg.startsWith('/')) return next();

  try {
    const api = await ApiPromise.create({ provider: new WsProvider(RPC) });

    switch (session.step) {
      case 'token': {
        const tokenId = parseInt(msg);
        if (!Object.values(ASSET_IDS).includes(tokenId)) {
          return ctx.reply('❌ Invalid token ID. Please try again.');
        }
        session.tokenId = tokenId;
        session.tokenSymbol = Object.keys(ASSET_IDS).find(k => ASSET_IDS[k] === tokenId);
        session.step = 'recipient';
        userSessions.set(userId, session);
        return ctx.reply(
          `📤 *Send ${session.tokenSymbol}*\n\nEnter recipient address:\n\n💡 Example: 0xD16101f623B17284AfCd7F28dE6e3B29D2646be0\n⚠️ Double-check address before confirming.`,
          { parse_mode: 'Markdown' }
        );
      }

      case 'recipient': {
        if (!/^0x[a-fA-F0-9]{40}$/.test(msg)) {
          return ctx.reply("❌ Invalid address. Must be a valid 0x... Ethereum-format address.");
        }
        session.recipient = msg;
        session.step = 'amount';
        userSessions.set(userId, session);

        const { tokenId, wallet } = session;
        const address = new Keyring({ type: 'ethereum' }).addFromUri(wallet.mnemonic).address;

        let balance;
        if (tokenId === ASSET_IDS.ROOT) {
          balance = (await api.query.system.account(address)).data.free;
        } else {
          const res = await api.query.assets.account(tokenId, address);
          balance = res.isSome ? res.unwrap().balance : 0n;
        }

        session.balance = balance;
        userSessions.set(userId, session);

        await ctx.reply(
          `✅ Recipient set to \`${msg}\`\n\n💰 Your balance: ${format(balance)} ${session.tokenSymbol}\n\nEnter amount to send:`,
          { parse_mode: 'Markdown' }
        );
        await api.disconnect();
        break;
      }

      case 'amount': {
        const raw = parseToRaw(msg);
        if (raw <= 0n) return ctx.reply("❌ Invalid amount. Must be a positive number.");

        const { balance, wallet, recipient, tokenId } = session;
        const sender = new Keyring({ type: 'ethereum' }).addFromUri(wallet.mnemonic);

        const tx = tokenId === ASSET_IDS.ROOT
          ? api.tx.balances.transfer(recipient, raw)
          : api.tx.assets.transfer(tokenId, recipient, raw);

        const feeInfo = await tx.paymentInfo(sender);
        const fee = feeInfo.partialFee;

        if (tokenId === ASSET_IDS.ROOT && raw + fee > balance) {
          return ctx.reply(`❌ Insufficient balance. You only have ${format(balance)} ROOT including fees.`);
        }

        session.amount = raw;
        session.amountHuman = msg;
        session.estimatedFee = fee;
        session.step = 'confirm';
        userSessions.set(userId, session);

        await ctx.reply(
          `🔍 *Transaction Summary*\n\n` +
          `📬 To: \`${recipient}\`\n` +
          `💸 Amount: *${msg} ${session.tokenSymbol}*\n` +
          `⛽ Est\. Fee: ~${format(fee)} ${session.tokenSymbol}\n` +
          `💰 Total Cost: ~${tokenId === ASSET_IDS.ROOT ? (parseFloat(msg) + parseFloat(format(fee))).toFixed(6) : msg} ${session.tokenSymbol}\n\n` +
          `Type "confirm" to send or "cancel" to abort.`,
          { parse_mode: 'Markdown' }
        );
        await api.disconnect();
        break;
      }

      case 'confirm': {
        if (msg.toLowerCase() === 'confirm') {
          const { wallet, recipient, amount, tokenId } = session;
          const api = await ApiPromise.create({ provider: new WsProvider(RPC) });
          const sender = new Keyring({ type: 'ethereum' }).addFromUri(wallet.mnemonic);

          const tx = tokenId === ASSET_IDS.ROOT
            ? api.tx.balances.transfer(recipient, amount)
            : api.tx.assets.transfer(tokenId, recipient, amount);

          await ctx.reply('⏳ Sending transaction...');
          const unsub = await tx.signAndSend(sender, ({ status }) => {
            if (status.isInBlock) {
              ctx.reply(`✅ Transaction included in block: ${status.asInBlock}`);
              unsub();
              api.disconnect();
            }
          });

          userSessions.delete(userId);
        } else {
          await ctx.reply('❌ Send cancelled.');
          userSessions.delete(userId);
        }
        break;
      }
    }
  } catch (err) {
    console.error(err);
    await ctx.reply(`❌ Error: ${err.message}`);
    userSessions.delete(ctx.from.id.toString());
  }

  return next();
};

module.exports = handleSend;
module.exports.sendMiddleware = sendMiddleware;
