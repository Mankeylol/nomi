const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { getUserWallet } = require('../walletManager');
const { Markup } = require('telegraf');

// ROOT Network configuration
const ROOT_NETWORK_ENDPOINT = 'wss://porcini.rootnet.app/ws';
const DECIMAL_PLACES = 6; // ROOT token has 6 decimal places

// Store user sessions for multi-step sending process
const userSessions = new Map();

// Middleware to handle multi-step sending process
const sendMiddleware = (ctx, next) => {
  const userId = ctx.from.id.toString();
  const session = userSessions.get(userId);
  
  if (session && session.step && ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
    handleSendStep(ctx, session);
    return;
  }
  
  return next();
};

// Main send handler
async function handleSend(ctx) {
  const userId = ctx.from.id.toString();
  
  try {
    // Clear any existing session
    userSessions.delete(userId);
    
    // Check if user has a wallet
    const wallet = getUserWallet(userId);
    if (!wallet) {
      await ctx.reply('❌ No wallet found. Please use /start to create a wallet first.');
      return;
    }

    // Initialize new sending session
    userSessions.set(userId, {
      step: 'recipient',
      wallet: wallet
    });

    await ctx.reply(
      '📤 **Send ROOT Tokens**\n\n' +
      'Please enter the recipient\'s ROOT address:\n\n' +
      '💡 *Example: 0xD06101f623B17284A7Cd7F28dE6e3B29D2646be0*\n' +
      '⚠️ *Make sure the address is valid and double-check before sending*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '❌ Cancel', callback_data: 'cancel_send' }
          ]]
        }
      }
    );

  } catch (error) {
    console.error('Error in handleSend:', error);
    await ctx.reply('❌ An error occurred while initializing the send process. Please try again.');
    userSessions.delete(userId);
  }
}

// Handle different steps of the sending process
async function handleSendStep(ctx, session) {
  const userId = ctx.from.id.toString();
  const input = ctx.message.text.trim();

  try {
    switch (session.step) {
      case 'recipient':
        await handleRecipientInput(ctx, session, input);
        break;
      case 'amount':
        await handleAmountInput(ctx, session, input);
        break;
      default:
        userSessions.delete(userId);
        await ctx.reply('❌ Invalid session state. Please start over with the send command.');
    }
  } catch (error) {
    console.error('Error in handleSendStep:', error);
    await ctx.reply('❌ An error occurred. Please try again.');
    userSessions.delete(userId);
  }
}

// Handle recipient address input
async function handleRecipientInput(ctx, session, address) {
  const userId = ctx.from.id.toString();


  if (!isValidEthereumAddress(address)) {
    await ctx.reply(
      '❌ Invalid ROOT address format.\n\n' +
      '✅ Valid format: 0x followed by 40 hexadecimal characters\n' +
      '💡 Example: 0xD16101f623B17284AfCd7F28dE6e3B29D2646be0\n\n' +
      'Please enter a valid ROOT address:'
    );
    return;
  }

  // Update session
  session.recipient = address;
  session.step = 'amount';
  userSessions.set(userId, session);

  // Get current balance for reference
  const balance = await getBalance(session.wallet.address);
  const formattedBalance = formatTokenAmount(balance.free);

  await ctx.reply(
    `✅ **Recipient Address Set**\n\n` +
    `📬 **To:** \`${address}\`\n\n` +
    `💰 **Your Balance:** ${formattedBalance} ROOT\n\n` +
    `Please enter the amount to send (in ROOT):`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💰 Send Max', callback_data: 'send_max' },
            { text: '❌ Cancel', callback_data: 'cancel_send' }
          ]
        ]
      }
    }
  );
}

// Handle amount input
async function handleAmountInput(ctx, session, amountStr) {
  const userId = ctx.from.id.toString();

  // Parse and validate amount
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ Invalid amount. Please enter a valid positive number (e.g., 1.5 or 10):');
    return;
  }

  // Convert to planck units (smallest unit)
  const amountInPlanck = BigInt(Math.floor(amount * Math.pow(10, DECIMAL_PLACES)));
  
  // Check balance
  const balance = await getBalance(session.wallet.address);
  
  if (amountInPlanck > balance.free) {
    const formattedBalance = formatTokenAmount(balance.free);
    await ctx.reply(
      `❌ **Insufficient Balance**\n\n` +
      `💰 **Available:** ${formattedBalance} ROOT\n` +
      `📤 **Requested:** ${amount} ROOT\n\n` +
      `Please enter a smaller amount:`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Update session and show confirmation
  session.amount = amount;
  session.amountInPlanck = amountInPlanck;
  userSessions.set(userId, session);

  // Calculate estimated fee
  const estimatedFee = await estimateTransferFee(session.wallet.address, session.recipient, amountInPlanck);
  const formattedFee = formatTokenAmount(estimatedFee);
  const totalCost = amount + parseFloat(formattedFee);

  await ctx.reply(
    `🔍 **Transaction Summary**\n\n` +
    `📬 **To:** \`${session.recipient}\`\n` +
    `💸 **Amount:** ${amount} ROOT\n` +
    `⛽ **Est. Fee:** ~${formattedFee} ROOT\n` +
    `💰 **Total Cost:** ~${totalCost.toFixed(6)} ROOT\n\n` +
    `❓ **Confirm this transaction?**`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm & Send', callback_data: 'confirm_send' },
            { text: '❌ Cancel', callback_data: 'cancel_send' }
          ]
        ]
      }
    }
  );
}

// Execute the actual transfer
async function executeTransfer(ctx, session) {
  const userId = ctx.from.id.toString();
  let api;
  
  try {
    await ctx.reply('⏳ Processing transaction...');

    // Connect to ROOT network
    const wsProvider = new WsProvider(ROOT_NETWORK_ENDPOINT);
    api = await ApiPromise.create({ provider: wsProvider });

    // Create keyring with ECDSA (Ethereum-compatible) for ROOT Network
    const keyring = new Keyring({ type: 'ethereum' });
    const senderPair = keyring.addFromUri(session.wallet.mnemonic);

    // Create transfer extrinsic
    const transfer = api.tx.balances.transfer(session.recipient, session.amountInPlanck.toString());

    // Get payment info before sending
    const paymentInfo = await transfer.paymentInfo(senderPair);
    console.log(`Transaction fee: ${formatTokenAmount(paymentInfo.partialFee)} ROOT`);

    // Sign and send transaction
    const txHash = await new Promise((resolve, reject) => {
      transfer.signAndSend(senderPair, ({ status, dispatchError, txHash }) => {
        if (status.isInBlock) {
          if (dispatchError) {
            if (dispatchError.isModule) {
              const decoded = api.registry.findMetaError(dispatchError.asModule);
              const { section, name, docs } = decoded;
              reject(new Error(`${section}.${name}: ${docs.join(' ')}`));
            } else {
              reject(new Error(dispatchError.toString()));
            }
          } else {
            resolve(txHash);
          }
        }
      }).catch(reject);
    });

    await ctx.reply(
      `✅ **Transaction Sent Successfully!**\n\n` +
      `📤 **Amount:** ${session.amount} ROOT\n` +
      `📬 **To:** \`${session.recipient}\`\n` +
      `🔗 **Transaction Hash:** \`${txHash.toHex()}\`\n\n` +
      `⏰ *Transaction is being processed on the ROOT network...*\n` +
      `🔍 *You can check the status on ROOT Network explorer*`,
      { parse_mode: 'Markdown' }
    );

    // Monitor for finalization
    monitorFinalization(ctx, api, txHash, session);

    // Clean up session
    userSessions.delete(userId);

  } catch (error) {
    console.error('Transfer execution error:', error);
    let errorMessage = 'Transaction failed. ';
    
    if (error.message.includes('InsufficientBalance')) {
      errorMessage += 'Insufficient balance to cover transaction and fees.';
    } else if (error.message.includes('LiquidityRestrictions')) {
      errorMessage += 'Account has liquidity restrictions.';
    } else {
      errorMessage += error.message;
    }
    
    await ctx.reply(
      `❌ **Transaction Failed**\n\n` +
      `${errorMessage}\n\n` +
      `Please try again or contact support if the issue persists.`
    );
    userSessions.delete(userId);
  } finally {
    if (api) {
      await api.disconnect();
    }
  }
}

// Monitor transaction finalization
async function monitorFinalization(ctx, api, txHash, session) {
  try {
    const unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
      try {
        const blockHash = header.hash;
        const block = await api.rpc.chain.getBlock(blockHash);
        
        // Check if our transaction is in this finalized block
        const found = block.block.extrinsics.find(ext => ext.hash.toHex() === txHash.toHex());
        
        if (found) {
          await ctx.reply(
            `🎉 **Transaction Finalized!**\n\n` +
            `✅ Your transfer of ${session.amount} ROOT has been confirmed and finalized.\n` +
            `📦 **Block:** #${header.number}\n` +
            `🔗 **Hash:** \`${txHash.toHex()}\`\n\n` +
            `💫 *Transaction is now immutable on the ROOT Network!*`,
            { parse_mode: 'Markdown' }
          );
          unsubscribe();
        }
      } catch (error) {
        console.error('Error checking finalized block:', error);
      }
    });

    // Auto-unsubscribe after 5 minutes
    setTimeout(() => {
      unsubscribe();
    }, 300000);

  } catch (error) {
    console.error('Transaction monitoring error:', error);
  }
}

// Get account balance using ROOT Network API
async function getBalance(address) {
  let api;
  try {
    const wsProvider = new WsProvider(ROOT_NETWORK_ENDPOINT);
    api = await ApiPromise.create({ provider: wsProvider });
    
    const { data: balance } = await api.query.system.account(address);
    return balance;
  } catch (error) {
    console.error('Balance query error:', error);
    return { free: BigInt(0), reserved: BigInt(0), miscFrozen: BigInt(0), feeFrozen: BigInt(0) };
  } finally {
    if (api) {
      await api.disconnect();
    }
  }
}

// Estimate transfer fee using ROOT Network API
async function estimateTransferFee(from, to, amount) {
  let api;
  try {
    const wsProvider = new WsProvider(ROOT_NETWORK_ENDPOINT);
    api = await ApiPromise.create({ provider: wsProvider });
    
    const transfer = api.tx.balances.transfer(to, amount.toString());
    const info = await transfer.paymentInfo(from);
    
    return info.partialFee.toBigInt();
  } catch (error) {
    console.error('Fee estimation error:', error);
    // Return default fee estimate (0.001 ROOT = 1000 planck units)
    return BigInt(1000);
  } finally {
    if (api) {
      await api.disconnect();
    }
  }
}

// Format token amount for display
function formatTokenAmount(balance) {
  const amount = BigInt(balance);
  const divisor = BigInt(Math.pow(10, DECIMAL_PLACES));
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;
  
  return `${wholePart}.${fractionalPart.toString().padStart(DECIMAL_PLACES, '0')}`;
}

// Validate Ethereum-style address (used by ROOT Network)
function isValidEthereumAddress(address) {
  // ROOT Network uses Ethereum-compatible addresses
  // Format: 0x followed by 40 hexadecimal characters (case insensitive)
  const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethereumAddressRegex.test(address);
}

// Handle callback queries for send operations
async function handleSendCallbacks(ctx) {
  const userId = ctx.from.id.toString();
  const session = userSessions.get(userId);

  if (!session) {
    await ctx.answerCbQuery('Session expired. Please start over.');
    return;
  }

  switch (ctx.callbackQuery.data) {
    case 'send_max':
      try {
        const balance = await getBalance(session.wallet.address);
        const estimatedFee = await estimateTransferFee(session.wallet.address, session.recipient, balance.free);
        const maxAmountInPlanck = balance.free - estimatedFee;
        
        if (maxAmountInPlanck <= 0n) {
          await ctx.answerCbQuery('Insufficient balance for transaction fees.');
          return;
        }
        
        const maxAmount = Number(maxAmountInPlanck) / Math.pow(10, DECIMAL_PLACES);
        await handleAmountInput(ctx, session, maxAmount.toFixed(6));
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Send max error:', error);
        await ctx.answerCbQuery('Error calculating maximum amount.');
      }
      break;

    case 'confirm_send':
      await ctx.answerCbQuery();
      await executeTransfer(ctx, session);
      break;

    case 'cancel_send':
      userSessions.delete(userId);
      await ctx.answerCbQuery();
      await ctx.reply('❌ Send operation cancelled.');
      break;

    default:
      await ctx.answerCbQuery('Unknown action.');
  }
}

// Export functions
module.exports = handleSend;
module.exports.sendMiddleware = sendMiddleware;
module.exports.handleSendCallbacks = handleSendCallbacks;
