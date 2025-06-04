const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { getUserWallet } = require('../walletManager');

const pendingTransactions = new Map();

async function handleSend(ctx) {
    const userId = ctx.from.id;
    const wallet = getUserWallet(userId.toString());
   
    if (!wallet) {
        return ctx.reply("❌ No wallet found. Use /start first.");
    }

    pendingTransactions.set(userId, { step: 'await_address' });

    await ctx.reply(
        `📤 Send from: ${wallet.address}\n\n` +
        'Please enter the recipient address:'
    );
}

async function sendMiddleware(ctx, next) {
    if (!ctx.message || !ctx.message.text) return next();
   
    const userId = ctx.from.id;
    const pendingTx = pendingTransactions.get(userId);
   
    if (!pendingTx) return next();

    try {
        const wallet = getUserWallet(userId.toString());
        if (!wallet) {
            pendingTransactions.delete(userId);
            return ctx.reply("❌ Wallet not found. Use /start first.");
        }

        if (pendingTx.step === 'await_address') {
            const address = ctx.message.text.trim();
           
            if (!isValidAddress(address)) {
                return ctx.reply("❌ Invalid address format. Please try again:");
            }

            pendingTx.recipient = address;
            pendingTx.step = 'await_amount';
            pendingTransactions.set(userId, pendingTx);

            return ctx.reply(
                `Recipient: ${address}\n\n` +
                'Please enter the amount to send (in ROOT):'
            );
        }

        if (pendingTx.step === 'await_amount') {
            const amount = parseFloat(ctx.message.text.trim());
           
            if (isNaN(amount) || amount <= 0) {
                return ctx.reply("❌ Invalid amount. Please enter a positive number:");
            }

            const amountInBaseUnits = Math.floor(amount * 1_000_000);

            pendingTx.amount = amount;
            pendingTx.amountInBaseUnits = amountInBaseUnits;
            pendingTx.step = 'confirm';
            pendingTransactions.set(userId, pendingTx);

            return ctx.reply(
                `⚠️ Confirm Transaction:\n\n` +
                `From: ${wallet.address}\n` +
                `To: ${pendingTx.recipient}\n` +
                `Amount: ${amount} ROOT\n\n` +
                'Reply "confirm" to send or "cancel" to abort.',
                { parse_mode: 'Markdown' }
            );
        }

        if (pendingTx.step === 'confirm') {
            const response = ctx.message.text.trim().toLowerCase();
           
            if (response === 'confirm') {
                await executeSend(ctx, userId, pendingTx);
            } else if (response === 'cancel') {
                pendingTransactions.delete(userId);
                return ctx.reply("❌ Transaction cancelled.");
            } else {
                return ctx.reply('Please reply "confirm" or "cancel":');
            }
        }

    } catch (error) {
        console.error('Send error:', error);
        pendingTransactions.delete(userId);
        ctx.reply(`❌ Error: ${error.message}`);
    }

    return next();
}

async function executeSend(ctx, userId, txDetails) {
    const wallet = getUserWallet(userId.toString());
    if (!wallet) throw new Error('Wallet not found');

    const provider = new WsProvider('wss://porcini.rootnet.app/archive/ws');
    let api;

    const processingMsg = await ctx.reply('⏳ Processing transaction...');

    try {
        api = await ApiPromise.create({ provider });

        const keyring = new Keyring({ type: 'ethereum' });
        const account = keyring.addFromUri(wallet.mnemonic);
        
        console.log('Wallet address from getUserWallet:', wallet.address);
        console.log('Account address from keyring:', account.address);
        
        const actualAddress = account.address;

        const { data: balance } = await api.query.system.account(actualAddress);
        const availableBalance = balance.free.toBigInt();
        
        const transfer = api.tx.balances.transfer(
            txDetails.recipient,
            txDetails.amountInBaseUnits
        );
        
        const paymentInfo = await transfer.paymentInfo(account);
        const fee = paymentInfo.partialFee.toBigInt();
        
        console.log(`Available balance: ${availableBalance}`);
        console.log(`Amount to send: ${txDetails.amountInBaseUnits}`);
        console.log(`Estimated fee: ${fee}`);
        console.log(`Total needed: ${BigInt(txDetails.amountInBaseUnits) + fee}`);
        
        if (availableBalance < BigInt(txDetails.amountInBaseUnits) + fee) {
            const availableFormatted = Number(availableBalance) / 1_000_000;
            const feeFormatted = Number(fee) / 1_000_000;
            throw new Error(`Insufficient balance. Available: ${availableFormatted.toFixed(6)} ROOT, Amount: ${txDetails.amount} ROOT, Fee: ${feeFormatted.toFixed(6)} ROOT`);
        }

        const hash = await new Promise((resolve, reject) => {
            let unsub;
            
            transfer.signAndSend(account, ({ status, dispatchError, events }) => {
                console.log('Transaction status:', status.type);
                
                if (status.isInBlock) {
                    console.log('Transaction included in block:', status.asInBlock.toString());
                    
                    if (dispatchError) {
                        if (dispatchError.isModule) {
                            const decoded = api.registry.findMetaError(dispatchError.asModule);
                            const { docs, method, section } = decoded;
                            reject(new Error(`${section}.${method}: ${docs.join(' ')}`));
                        } else {
                            reject(new Error(dispatchError.toString()));
                        }
                    } else {
                        resolve(status.asInBlock.toString());
                    }
                    
                    if (unsub) unsub();
                } else if (status.isFinalized) {
                    console.log('Transaction finalized:', status.asFinalized.toString());
                    if (!dispatchError) {
                        resolve(status.asFinalized.toString());
                    }
                    if (unsub) unsub();
                } else if (status.isInvalid) {
                    reject(new Error('Transaction is invalid'));
                    if (unsub) unsub();
                } else if (status.isDropped) {
                    reject(new Error('Transaction was dropped'));
                    if (unsub) unsub();
                }
            }).then(unsubFn => {
                unsub = unsubFn;
            }).catch(reject);
        });

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            null,
            `✅ Transaction successful!\n\n` +
            `Amount: ${txDetails.amount} ROOT\n` +
            `From: ${wallet.address}\n` +
            `To: ${txDetails.recipient}\n\n` +
            `Hash: \`${hash}\`\n\n` +
            `[View on explorer](https://porcini.rootscan.io/tx/${hash})`,
            { parse_mode: 'Markdown' }
        );

    } catch (error) {
        console.error('Transaction error:', error);
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            null,
            `❌ Failed to send transaction:\n${error.message}`
        );
        throw error;
    } finally {
        if (api) {
            await api.disconnect();
        }
        pendingTransactions.delete(userId);
    }
}

function isValidAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

module.exports = handleSend;

module.exports.sendMiddleware = sendMiddleware;