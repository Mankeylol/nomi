# TRN Engine

A Telegram bot for managing tokens, staking, and DeFi interactions on RootNetwork. Built using Node.js and the Telegraf framework, the bot supports:

* Wallet generation and lookup
* Sending any supported token (ROOT, XRP, ASTO, SYLO)
* Swapping tokens via DEX
* Staking ROOT tokens

---

## 🚀 Features

### ✅ Wallet

* Generates a new wallet on `/start` if none exists
* Displays wallet address

### ✅ Send Tokens

* Lists available tokens with asset IDs
* Lets users select a token
* Prompts for recipient address with example & warning
* Displays balance and allows entering amount
* Supports "Send Max" and shows transaction fee
* Uses `balances.transfer` for ROOT and `assets.transfer` for other tokens

### ✅ Swap Tokens

* Asks for token A (from) and token B (to)
* Accepts amount
* Sends DEX swap using `dex.swapWithExactSupply`

### ✅ Stake

* Lists assets and lets user pick a token
* ROOT supports staking with `staking.bond(value, "Staked")`
* Prompts for amount
* Confirms stake before sending

---

## 📦 Setup

1. Clone the repo:

```bash
git clone https://github.com/Mankeylol/nomi.git
cd nomi
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file:

```
BOT_TOKEN=your_telegram_bot_token
```

4. Run the bot:

```bash
node bot.js
```

---

## 🛠 Tech Stack

* [Node.js](https://nodejs.org/)
* [Telegraf](https://telegraf.js.org/)
* [@polkadot/api](https://polkadot.js.org/docs/api/) for RootNetwork RPC

---

## 🧩 Roadmap

* Intgration TEEs for attested proofs\\

---

Made with ❤️ on RootNetwork

---
