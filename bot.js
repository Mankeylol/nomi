require('dotenv').config();

const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');
const { getUserWallet, createUserWallet } = require('./walletManager');
const handleBalance = require('./features/balance');
const handleSend = require('./features/send');
const { sendMiddleware, handleSendCallbacks } = require('./features/send');
const handleStake = require('./features/stake');
const handleSwap = require('./features/swap');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Add the send middleware to handle multi-step sending
bot.use(sendMiddleware);

// Start command - Create or display wallet
bot.command('start', async (ctx) => {
  const userId = ctx.from.id.toString();
  
  try {
    let wallet = getUserWallet(userId);

    if (!wallet) {
      wallet = createUserWallet(userId);
      await ctx.reply(
        `🆕 **New ROOT Wallet Created!**\n\n` +
        `📬 **Address:**\n\`${wallet.address}\`\n\n` +
        `🔐 **Security Notice:** Your wallet is encrypted and stored securely. Never share your recovery phrase with anyone!\n\n` +
        `💡 **Getting Started:** Use the buttons below to manage your ROOT tokens.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        `💼 **Welcome Back!**\n\n` +
        `📬 **Your Wallet:**\n\`${wallet.address}\`\n\n` +
        `Ready to manage your ROOT tokens? Choose an action below:`,
        { parse_mode: 'Markdown' }
      );
    }

    await ctx.reply(
      '🚀 **ROOT Network Bot**\n\nChoose an action:',
      Markup.inlineKeyboard([
        [Markup.button.callback('💰 Balance', 'balance')],
        [Markup.button.callback('📤 Send', 'send')],
        [Markup.button.callback('🔄 Swap', 'swap')],
        [Markup.button.callback('📥 Stake', 'stake')],
        [Markup.button.callback('ℹ️ Help', 'help')]
      ])
    );

  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('❌ An error occurred while setting up your wallet. Please try again.');
  }
});

// Help command
bot.command('help', async (ctx) => {
  await ctx.reply(
    `🤖 **ROOT Network Bot Help**\n\n` +
    `**Available Commands:**\n` +
    `• /start - Create wallet or show main menu\n` +
    `• /balance - Check your ROOT balance\n` +
    `• /help - Show this help message\n\n` +
    `**Features:**\n` +
    `💰 **Balance** - View your ROOT token balance\n` +
    `📤 **Send** - Transfer ROOT tokens to other addresses\n` +
    `🔄 **Swap** - Exchange tokens (coming soon)\n` +
    `📥 **Stake** - Stake ROOT tokens (coming soon)\n\n` +
    `**Security:**\n` +
    `🔐 Your wallet keys are encrypted and stored securely\n` +
    `🛡️ Never share your recovery phrase with anyone\n` +
    `⚠️ Always verify recipient addresses before sending\n\n` +
    `**Support:**\n` +
    `Need help? Contact our support team or visit ROOT Network documentation.`,
    { parse_mode: 'Markdown' }
  );
});

// Balance command (shortcut)
bot.command('balance', async (ctx) => {
  await handleBalance(ctx);
});

// Action handlers for inline keyboard buttons
bot.action('balance', async (ctx) => {
  await ctx.answerCbQuery();
  console.log('Balance action triggered');
  await handleBalance(ctx);
});

bot.action('send', async (ctx) => {
  await ctx.answerCbQuery();
  console.log('Send action triggered');
  await handleSend(ctx);
});

bot.action('swap', async (ctx) => {
  await ctx.answerCbQuery();
  console.log('Swap action triggered');
  await handleSwap(ctx);
});

bot.action('stake', async (ctx) => {
  await ctx.answerCbQuery();
  console.log('Stake action triggered');
  await handleStake(ctx);
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🤖 **ROOT Network Bot Help**\n\n` +
    `**Available Features:**\n\n` +
    `💰 **Balance** - Check your ROOT token balance and transaction history\n\n` +
    `📤 **Send** - Transfer ROOT tokens to any valid address\n` +
    `   • Enter recipient address\n` +
    `   • Specify amount to send\n` +
    `   • Confirm transaction details\n\n` +
    `🔄 **Swap** - Exchange between different tokens (coming soon)\n\n` +
    `📥 **Stake** - Stake your ROOT tokens to earn rewards (coming soon)\n\n` +
    `**Security Tips:**\n` +
    `🔐 Your wallet is automatically encrypted\n` +
    `🛡️ Always double-check recipient addresses\n` +
    `⚠️ Keep your bot conversations private\n\n` +
    `**ROOT Network:**\n` +
    `🌐 Built on Substrate technology\n` +
    `⚡ Fast and secure transactions\n` +
    `💎 Native ROOT token support`,
    { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔙 Back to Menu', callback_data: 'main_menu' }
        ]]
      }
    }
  );
});

// Send-related callback handlers
bot.action('send_max', async (ctx) => {
  await handleSendCallbacks(ctx);
});

bot.action('confirm_send', async (ctx) => {
  await handleSendCallbacks(ctx);
});

bot.action('cancel_send', async (ctx) => {
  await handleSendCallbacks(ctx);
});

// Main menu callback
bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    '🚀 **ROOT Network Bot**\n\nChoose an action:',
    Markup.inlineKeyboard([
      [Markup.button.callback('💰 Balance', 'balance')],
      [Markup.button.callback('📤 Send', 'send')],
      [Markup.button.callback('🔄 Swap', 'swap')],
      [Markup.button.callback('📥 Stake', 'stake')],
      [Markup.button.callback('ℹ️ Help', 'help')]
    ])
  );
});

// Refresh balance callback (for balance feature)
bot.action('refresh_balance', async (ctx) => {
  await ctx.answerCbQuery('🔄 Refreshing balance...');
  await handleBalance(ctx);
});

// Error handling middleware
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An unexpected error occurred. Please try again or contact support if the issue persists.');
});

// shutdown handling
process.once('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down gracefully...');
  bot.stop('SIGTERM');
});

// Start the bot
console.log('🚀 Starting Bot...');
bot.launch()
  .then(() => {
    console.log('✅ Bot launched successfully!');
    console.log('🤖 ROOT Network Bot is now running...');
  })
  .catch((error) => {
    console.error('❌ Failed to launch bot:', error);
    process.exit(1);
  });

// Enable stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
