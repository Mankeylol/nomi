const { ApiPromise, WsProvider } = require('@polkadot/api');

const ROOT_ENDPOINT = 'wss://porcini.rootnet.app/ws'; // testnet

// Returns an array of { assetId, balance } for the given userAddress
async function getTokenBalances(userAddress) {
  let api;
try {
  api = await ApiPromise.create({ provider: new WsProvider(ROOT_ENDPOINT) });
} catch (err) {
  console.error('API init error:', err);
  return [];
}
  try {
    const allBalances = await api.query.assets.account.entries();
    const userBalances = allBalances
      .filter(([key, balance]) => {
        const [assetId, address] = key.args;
        return address.toString() === userAddress;
      })
      .map(([key, balance]) => {
        const [assetId] = key.args;
        const bal = balance.unwrapOrDefault();
        return {
          assetId: assetId.toString(),
          balance: bal.balance.toString()
        };
      });
    return userBalances;
  } finally {
    await api.disconnect();
  }
}

module.exports = {
  getTokenBalances,
};
