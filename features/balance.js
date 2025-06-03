// features/balance.js
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { getUserWallet } = require('../walletManager');

async function handleBalance(ctx) {
  const wallet = getUserWallet(ctx.from.id);
  if (!wallet) return ctx.reply("❌ No wallet found. Use /start first.");

  const provider = new WsProvider('wss://porcini.rootnet.app/archive/ws');
  const api = await ApiPromise.create({ provider });

  const { data: balance } = await api.query.system.account(wallet.address);
  ctx.reply(`💰 Your balance: ${balance.free.toHuman()}`);
}

module.exports = handleBalance;
