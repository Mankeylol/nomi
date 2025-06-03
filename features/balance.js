const { ApiPromise, WsProvider } = require('@polkadot/api');
const { getUserWallet } = require('../walletManager');

async function handleBalance(ctx) {
  const wallet = getUserWallet(ctx.from.id.toString());
  if (!wallet) return ctx.reply("❌ No wallet found. Use /start first.");

  try {
    const provider = new WsProvider('wss://porcini.rootnet.app/archive/ws');
    const api = await ApiPromise.create({ provider });

    const { data: balance } = await api.query.system.account(wallet.address);
    const raw = balance.free.toBigInt(); // raw value in base units

    const formatted = Number(raw) / 1_000_000; // convert to float with 6 decimals
    await ctx.reply(`💰 Your balance: ${formatted.toFixed(6)} ROOT`);

    await api.disconnect();
  } catch (err) {
    console.error('Balance error:', err);
    ctx.reply("⚠️ Failed to fetch balance. Please try again later.");
  }
}

module.exports = handleBalance;

