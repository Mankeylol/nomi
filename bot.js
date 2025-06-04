require('dotenv').config();
const { Telegraf } = require('telegraf');
const { Markup } = require('telegraf');

const { getUserWallet, createUserWallet } = require('./walletManager');
const handleBalance = require('./features/balance');
const handleSend = require('./features/send');
const { sendMiddleware } = require('./features/send');
const handleStake = require('./features/stake');
const handleSwap = require('./features/swap');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(sendMiddleware);

bot.telegram.setMyCommands([
  { command: 'start', description: 'Start and create your wallet' },
  { command: 'balance', description: 'Check your wallet balance' },
  { command: 'send', description: 'Send tokens to another address' },
  { command: 'swap', description: 'Swap tokens' },
  { command: 'stake', description: 'Stake your tokens' }
]);

bot.command('balance', handleBalance);
bot.command('send', handleSend);
bot.command('swap', handleSwap);
bot.command('stake', handleStake);

bot.command('start', async (ctx) => {
  const userId = ctx.from.id.toString();
  let wallet = getUserWallet(userId);

  if (!wallet) {
    wallet = createUserWallet(userId);
    await ctx.reply(`🆕 New wallet created:\n${wallet.address}`);
  } else {
    await ctx.reply(`💼 Existing wallet:\n${wallet.address}`);
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




bot.launch();
