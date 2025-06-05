require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { getUserWallet, createUserWallet } = require('./walletManager');

const handleBalance = require('./features/balance');
const handleSend = require('./features/send');
const { sendMiddleware } = require('./features/send');

const handleSwap = require('./features/swap');
const { swapMiddleware } = require('./features/swap');

const handleStake = require('./features/stake');
const { stakeMiddleware } = require('./features/stake');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🧠 Attach middlewares
bot.use(sendMiddleware);
bot.use(swapMiddleware);
bot.use(stakeMiddleware);

// 🎛 Commands
bot.command('start', async (ctx) => {
  const userId = ctx.from.id.toString();
  let wallet = getUserWallet(userId);

  if (!wallet) {
    wallet = createUserWallet(userId);
    await ctx.reply(`🆕 New wallet created:\n\`${wallet.address}\``, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(`💼 Existing wallet:\n\`${wallet.address}\``, { parse_mode: 'Markdown' });
  }

  await ctx.reply(
    'Choose an action:',
    Markup.inlineKeyboard([
      [Markup.button.callback('💰 Balance', 'balance')],
      [Markup.button.callback('📤 Send', 'send')],
      [Markup.button.callback('🔄 Swap', 'swap')],
      [Markup.button.callback('📥 Stake', 'stake')],
    ])
  );
});

// 📥 Actions
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

// 🚀 Start bot
bot.launch();
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { getUserWallet, createUserWallet } = require('./walletManager');

const handleBalance = require('./features/balance');
const handleSend = require('./features/send');
const { sendMiddleware } = require('./features/send');

const handleSwap = require('./features/swap');
const { swapMiddleware } = require('./features/swap');

const handleStake = require('./features/stake');
const { stakeMiddleware } = require('./features/stake');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🧠 Attach middlewares
bot.use(sendMiddleware);
bot.use(swapMiddleware);
bot.use(stakeMiddleware);

// 🎛 Commands
bot.command('start', async (ctx) => {
  const userId = ctx.from.id.toString();
  let wallet = getUserWallet(userId);

  if (!wallet) {
    wallet = createUserWallet(userId);
    await ctx.reply(`🆕 New wallet created:\n\`${wallet.address}\``, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply(`💼 Existing wallet:\n\`${wallet.address}\``, { parse_mode: 'Markdown' });
  }

  await ctx.reply(
    'Choose an action:',
    Markup.inlineKeyboard([
      [Markup.button.callback('💰 Balance', 'balance')],
      [Markup.button.callback('📤 Send', 'send')],
      [Markup.button.callback('🔄 Swap', 'swap')],
      [Markup.button.callback('📥 Stake', 'stake')],
    ])
  );
});

// 📥 Actions
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

// 🚀 Start bot
bot.launch();
