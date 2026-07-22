import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';
import express from 'express';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_IDS;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN and CLIENT_ID are required');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const processedDMs = new Set();

// ========== GEMINI AI ==========

async function askGemini(message, userName) {
  if (!GEMINI_KEY) return 'AI is not configured.';

  const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

  const prompt = `You are Majnoun-Bot, a smart Discord bot assistant for the "Ruthless Pact" server. 
Answer in Arabic or English based on what the user uses. 
Be helpful, friendly, casual. If asked to do server actions, suggest the /command they should use.
User "${userName}" says: ${message}
Reply concisely (1-3 sentences).`;

  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
        }),
      });

      if (!res.ok) {
        console.error(`[Gemini] ${model} ${res.status}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        console.log(`[Gemini] ${model} OK`);
        return text;
      }
    } catch (e) {
      console.error(`[Gemini] ${model} error:`, e.message);
    }
  }

  return 'Sorry, AI is temporarily unavailable.';
}

// ========== SLASH COMMANDS ==========

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all commands'),
  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(opt => opt.setName('message').setDescription('What to say').setRequired(true)),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
    console.log('Slash commands registered!');
  } catch (e) {
    console.error('Failed to register commands:', e.message);
  }
}

function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ping') {
    interaction.reply(`Pong! Latency: ${client.ws.ping}ms`);
  }
  else if (commandName === 'help') {
    interaction.reply({
      embeds: [{
        title: 'Majnoun-Bot Commands',
        description: [
          '`/ping` - Check bot latency',
          '`/help` - Show this message',
          '`/say <message>` - Make me say something',
          '',
          '**DM me anything** and I will reply using AI!',
        ].join('\n'),
        color: 0x5865F2,
      }],
    });
  }
  else if (commandName === 'say') {
    const msg = interaction.options.getString('message');
    interaction.reply(msg);
  }
}

// ========== DM HANDLER ==========

async function handleDM(message) {
  if (processedDMs.has(message.id)) return;
  processedDMs.add(message.id);
  if (processedDMs.size > 200) {
    const first = processedDMs.values().next().value;
    processedDMs.delete(first);
  }

  const content = message.content.trim();
  if (!content) return;

  console.log(`[DM] ${message.author.tag}: ${content}`);

  await message.channel.sendTyping();
  const reply = await askGemini(content, message.author.username);
  await message.reply(reply);
  console.log(`[DM] Replied to ${message.author.tag}`);
}

// ========== BOT START ==========

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} guild(s)`);
  client.user.setPresence({ status: 'online', activities: [{ name: 'stalking', type: 4 }] });

  if (OWNER_ID) {
    client.users.fetch(OWNER_ID).then(user => {
      user.send('Majnoun-Bot is online! Send me a message and I will reply using AI.');
    }).catch(() => {});
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) {
    try {
      await handleDM(message);
    } catch (e) {
      console.error('[DM Error]', e.message);
      message.reply('An error occurred.').catch(() => {});
    }
  }
});

client.on('interactionCreate', (interaction) => {
  try {
    handleCommand(interaction);
  } catch (e) {
    console.error('[Command Error]', e.message);
  }
});

// ========== WEB SERVER (Railway health check) ==========

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'Majnoun-Bot Online', uptime: process.uptime() }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.listen(PORT, '0.0.0.0', () => console.log(`Web server on port ${PORT}`));

// ========== START ==========

registerCommands();
client.login(TOKEN);
