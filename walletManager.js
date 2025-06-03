const fs = require('fs');
const crypto = require('crypto');
const { Keyring } = require('@polkadot/keyring');
const { mnemonicGenerate } = require('@polkadot/util-crypto');

const DB_PATH = './db.json';
const ENC_KEY = process.env.ENCRYPTION_KEY; // 32-byte key
const IV = Buffer.alloc(16, 0); // Initialization vector (can also be random)

function encrypt(text) {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENC_KEY), IV);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(text) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY), IV);
  let decrypted = decipher.update(text, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getUserWallet(userId) {
  const db = loadDb();
  if (!db[userId]) return null;

  const mnemonic = decrypt(db[userId].mnemonic);

  const keyring = new Keyring({ type: 'ethereum' });
  const pair = keyring.addFromUri(mnemonic);

  return {
    address: pair.address,
    mnemonic
  };
}


function createUserWallet(userId) {
  const keyring = new Keyring({ type: 'ethereum' });

  const mnemonic = mnemonicGenerate();
  const pair = keyring.addFromUri(mnemonic);

  const db = loadDb();
  db[userId] = {
    address: pair.address,
    mnemonic: encrypt(mnemonic) // store encrypted mnemonic for recovery
  };

  saveDb(db);
  return {
    address: pair.address,
    mnemonic
  };
}

module.exports = {
  getUserWallet,
  createUserWallet
};
