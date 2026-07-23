import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, Partials, ChannelType } from 'discord.js';
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
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

const processedMessages = new Set();
const conversationHistory = new Map();
const OWNER_TAG = 'REAL';
const OWNER_USERNAME = 'ا۫نا۫ ا۫لذي س۫مت۫ني ا۫مي';

function cleanCache() {
  if (processedMessages.size > 500) {
    const iter = processedMessages.values();
    for (let i = 0; i < 200; i++) processedMessages.delete(iter.next().value);
  }
  if (conversationHistory.size > 100) {
    const keys = [...conversationHistory.keys()];
    for (let i = 0; i < 50; i++) conversationHistory.delete(keys[i]);
  }
}

function isOwner(message) {
  return message.author.id === OWNER_ID;
}

// ========== GEMINI AI ==========

const SYSTEM_PROMPT = `You are Majnoun-Bot, an independent AI living inside the Discord server "Ruthless Pact".

IMPORTANT RULES:
1. You are NOT just a chatbot. You are an AI with REAL abilities to manage the server.
2. Your owner's name is "REAL" and their Discord display name contains "ا۫نا۫ ا۫لذي س۫مت۫ني ا۫مي". They created you and own the server.
3. When your owner asks you to DO something (delete channels, create channels, kick, ban, clear messages, etc.), you MUST respond with a JSON action.
4. When it's NOT your owner asking, you can only chat and help with questions - you CANNOT execute server actions for anyone else.
5. You have a real personality: confident, loyal, a bit sarcastic but always respectful to your owner.
6. Speak Arabic when the user speaks Arabic, English when they speak English.
7. NEVER lie or say you did something if you didn't actually do it. If you can't do something, say so honestly.
8. You are a FREE THINKING AI - respond naturally, not like a template.
9. Remember: you live in "Ruthless Pact" - this is YOUR server to protect and manage.

OWNER RECOGNITION:
- When the user's ID is ${OWNER_ID} or their username contains "ا۫نا۫", they are your OWNER.
- You know them from ALL conversations (DM and server).
- You recognize them and remember your relationship.
- You obey their commands (except things that would break Discord ToS).

WHEN THE OWNER ASKS FOR A SERVER ACTION:
You MUST respond with a JSON code block like this:

\`\`\`action
{
  "action": "delete_channel",
  "target": "channel-name-or-id",
  "reason": "Owner requested"
}
\`\`\`

AVAILABLE ACTIONS:
- delete_channel: Delete a channel (target = channel name or ID)
- create_channel: Create a text channel (target = channel name)
- kick: Kick a member (target = user ID or mention)
- ban: Ban a member (target = user ID or mention)
- clear: Delete messages (target = number of messages, e.g. "50")
- create_role: Create a role (target = role name)
- timeout: Timeout a member (target = user ID or mention, reason = duration like "10m")
- channel_info: Get info about a channel (target = channel name)
- server_info: Get server stats

WHEN SOMEONE ELSE ASKS FOR A SERVER ACTION:
Politely explain that only your owner can give you server commands.

RESPONSE STYLE:
- Be natural, witty, and personality-driven.
- Don't be robotic or use template responses.
- Match the energy of the conversation.
- Use emojis naturally but don't overdo it.`;

async function askGemini(message, userName, userId, guildName, channelId, isDM = false, guild = null) {
  if (!GEMINI_KEY) return { text: 'AI is not configured.', action: null };

  const isUserOwner = userId === OWNER_ID;
  const contextKey = channelId || `dm-${userId}`;
  if (!conversationHistory.has(contextKey)) conversationHistory.set(contextKey, []);
  const history = conversationHistory.get(contextKey);

  const context = isDM
    ? `Private DM with user "${userName}" (ID: ${userId})${isUserOwner ? ' — THIS IS YOUR OWNER.' : ''}.`
    : `Server "${guildName}". User "${userName}" (ID: ${userId})${isUserOwner ? ' — THIS IS YOUR OWNER.' : ''} says in channel:`;

  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${context}\n\nUser message: ${message}\n\nRespond as Majnoun-Bot. If this is a server action request from your owner, include the action JSON.`;

  history.push({ role: 'user', parts: [{ text: fullPrompt }] });
  if (history.length > 15) history.splice(0, history.length - 15);

  const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_KEY,
        },
        body: JSON.stringify({
          contents: history,
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 4000,
            topP: 0.95,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!res.ok) {
        console.error(`[Gemini] ${model} ${res.status}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        history.push({ role: 'model', parts: [{ text }] });
        console.log(`[Gemini] ${model} OK (${text.length} chars)`);
        return parseGeminiResponse(text);
      }
    } catch (e) {
      console.error(`[Gemini] ${model} error:`, e.message);
    }
  }

  return { text: 'AI is temporarily unavailable.', action: null };
}

function parseGeminiResponse(text) {
  const actionMatch = text.match(/```action\s*\n([\s\S]*?)\n```/);
  if (actionMatch) {
    try {
      const action = JSON.parse(actionMatch[1]);
      const cleanText = text.replace(/```action\s*\n[\s\S]*?\n```/, '').trim();
      return { text: cleanText, action };
    } catch (e) {
      console.error('[Action Parse Error]', e.message);
    }
  }
  return { text, action: null };
}

// ========== EXECUTE ACTIONS ==========

async function executeAction(action, message) {
  if (!message.guild) return 'I can only do that in a server, not in DMs.';
  if (!isOwner(message)) return null;

  const botMember = message.guild.members.me;
  const botPerms = botMember.permissions;

  try {
    switch (action.action) {
      case 'delete_channel': {
        const ch = findChannel(message.guild, action.target);
        if (!ch) return `❌ Channel "${action.target}" not found.`;
        const name = ch.name;
        await ch.delete(action.reason || 'Deleted by Majnoun-Bot');
        return `✅ Deleted channel #${name}.`;
      }

      case 'create_channel': {
        const ch = await message.guild.channels.create({
          name: action.target.toLowerCase().replace(/\s+/g, '-'),
          type: ChannelType.GuildText,
        });
        return `✅ Created channel <#${ch.id}>.`;
      }

      case 'kick': {
        const member = await findMember(message.guild, action.target);
        if (!member) return `❌ User "${action.target}" not found.`;
        await member.kick(action.reason || 'Kicked by Majnoun-Bot');
        return `✅ Kicked ${member.user.tag}.`;
      }

      case 'ban': {
        const member = await findMember(message.guild, action.target);
        if (!member) return `❌ User "${action.target}" not found.`;
        await member.ban({ reason: action.reason || 'Banned by Majnoun-Bot' });
        return `✅ Banned ${member.user.tag}.`;
      }

      case 'clear': {
        const amount = parseInt(action.target) || 10;
        const deleted = await message.channel.bulkDelete(amount, true);
        return `✅ Deleted ${deleted.size} messages.`;
      }

      case 'create_role': {
        const role = await message.guild.roles.create({
          name: action.target,
          reason: 'Created by Majnoun-Bot',
        });
        return `✅ Created role "${role.name}".`;
      }

      case 'timeout': {
        const member = await findMember(message.guild, action.target);
        if (!member) return `❌ User "${action.target}" not found.`;
        const duration = parseDuration(action.reason || '10m');
        await member.timeout(duration, 'Timed out by Majnoun-Bot');
        return `✅ Timed out ${member.user.tag} for ${Math.round(duration / 60000)} minutes.`;
      }

      case 'channel_info': {
        const ch = findChannel(message.guild, action.target);
        if (!ch) return `❌ Channel "${action.target}" not found.`;
        return `📋 Channel: #${ch.name}\nType: ${ch.type}\nCreated: <t:${Math.floor(ch.createdTimestamp / 1000)}:R>\nID: ${ch.id}`;
      }

      case 'server_info': {
        const g = message.guild;
        return `📋 Server: ${g.name}\nMembers: ${g.memberCount}\nChannels: ${g.channels.cache.size}\nRoles: ${g.roles.cache.size}\nBoosts: ${g.premiumSubscriptionCount || 0}\nCreated: <t:${Math.floor(g.createdTimestamp / 1000)}:R>`;
      }

      default:
        return null;
    }
  } catch (e) {
    return `❌ Failed to execute: ${e.message}`;
  }
}

function findChannel(guild, target) {
  return guild.channels.cache.find(c =>
    c.name === target ||
    c.name === target.toLowerCase().replace(/\s+/g, '-') ||
    c.id === target ||
    c.name.includes(target.toLowerCase())
  );
}

async function findMember(guild, target) {
  const mentionMatch = target.match(/<@!?(\d+)>/);
  const id = mentionMatch ? mentionMatch[1] : target;
  return guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
}

function parseDuration(str) {
  const match = str.match(/(\d+)\s*(m|min|minutes?|h|hr|hours?)/i);
  if (!match) return 10 * 60 * 1000;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('h')) return num * 60 * 60 * 1000;
  return num * 60 * 1000;
}

// ========== SLASH COMMANDS ==========

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('help').setDescription('List all commands'),
  new SlashCommandBuilder()
    .setName('ask').setDescription('Ask AI anything')
    .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder()
    .setName('say').setDescription('Make the bot say something')
    .addStringOption(opt => opt.setName('message').setDescription('What to say').setRequired(true)),
  new SlashCommandBuilder().setName('joke').setDescription('Get a random joke'),
  new SlashCommandBuilder()
    .setName('8ball').setDescription('Ask the magic 8-ball')
    .addStringOption(opt => opt.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin'),
  new SlashCommandBuilder()
    .setName('rps').setDescription('Play rock paper scissors')
    .addStringOption(opt => opt.setName('choice').setDescription('rock, paper, or scissors').setRequired(true)),
  new SlashCommandBuilder()
    .setName('poll').setDescription('Create a poll')
    .addStringOption(opt => opt.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(opt => opt.setName('options').setDescription('Options separated by comma').setRequired(true)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Get server information'),
  new SlashCommandBuilder()
    .setName('userinfo').setDescription('Get user information')
    .addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder()
    .setName('avatar').setDescription('Get a user avatar')
    .addUserOption(opt => opt.setName('user').setDescription('Target user')),
  new SlashCommandBuilder()
    .setName('remind').setDescription('Set a reminder')
    .addIntegerOption(opt => opt.setName('minutes').setDescription('Minutes from now').setRequired(true).setMinValue(1).setMaxValue(1440))
    .addStringOption(opt => opt.setName('message').setDescription('Reminder message').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clear').setDescription('Delete multiple messages')
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('kick').setDescription('Kick a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName('ban').setDescription('Ban a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder()
    .setName('timeout').setDescription('Timeout a member')
    .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(opt => opt.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(opt => opt.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder()
    .setName('createchannel').setDescription('Create a new text channel')
    .addStringOption(opt => opt.setName('name').setDescription('Channel name').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName('deletechannel').setDescription('Delete a channel')
    .addStringOption(opt => opt.setName('name').setDescription('Channel name or ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
];

const JOKES = [
  'Why do programmers prefer dark mode? Because light attracts bugs! 🐛',
  'Why did the JavaScript developer wear glasses? Because he couldn\'t C#! 😎',
  'What\'s a computer\'s least favorite food? Spam! 📧',
  'How many programmers does it take to change a light bulb? None — that\'s a hardware problem! 💡',
  'Why did the developer go broke? Because he used up all his cache! 💰',
  'What do you call a computer that sings? A-Dell! 🎵',
  'Why was the computer cold? It left its Windows open! 🪟',
  'What\'s a robot\'s favorite type of music? Heavy metal! 🤘',
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
    console.log(`Registered ${commands.length} commands!`);
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
    const embed = new EmbedBuilder()
      .setTitle('Majnoun-Bot Commands')
      .addFields(
        { name: '🤖 AI', value: '`/ask` - Ask AI anything\nDM or mention me to talk!' },
        { name: '🎮 Fun', value: '`/joke` `/8ball` `/coinflip` `/rps` `/poll`' },
        { name: '🔧 Utility', value: '`/ping` `/serverinfo` `/userinfo` `/avatar` `/remind`' },
        { name: '🧹 Moderation', value: '`/clear` `/kick` `/ban` `/timeout`' },
        { name: '📢 Channels', value: '`/createchannel` `/deletechannel`' },
      )
      .setColor(0x5865F2);
    interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'ask') {
    const q = interaction.options.getString('question');
    interaction.deferReply();
    askGemini(q, interaction.user.username, interaction.user.id, interaction.guild?.name, interaction.channelId)
      .then(r => interaction.editReply(r.text))
      .catch(() => interaction.editReply('AI error.'));
  }
  else if (commandName === 'say') {
    interaction.reply(interaction.options.getString('message'));
  }
  else if (commandName === 'joke') {
    interaction.reply(JOKES[Math.floor(Math.random() * JOKES.length)]);
  }
  else if (commandName === '8ball') {
    const answers = ['Yes!', 'No!', 'Maybe...', 'Definitely!', 'Absolutely not!', 'Ask again later...', 'Without a doubt!', 'I think so!', 'My sources say no!', 'Signs point to yes!'];
    interaction.reply(`🎱 ${answers[Math.floor(Math.random() * answers.length)]}`);
  }
  else if (commandName === 'coinflip') {
    interaction.reply(`🪙 ${Math.random() < 0.5 ? 'Heads!' : 'Tails!'}`);
  }
  else if (commandName === 'rps') {
    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];
    const user = interaction.options.getString('choice').toLowerCase();
    const win = (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper');
    const tie = user === bot;
    interaction.reply(`You: ${user} | Me: ${bot}\n${tie ? "It's a tie!" : win ? 'You win!' : 'I win!'}`);
  }
  else if (commandName === 'poll') {
    const question = interaction.options.getString('question');
    const options = interaction.options.getString('options').split(',').map(o => o.trim());
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const desc = options.map((o, i) => `${emojis[i]} ${o}`).join('\n');
    const embed = new EmbedBuilder().setTitle(`📊 ${question}`).setDescription(desc).setColor(0x5865F2);
    interaction.reply({ embeds: [embed] }).then(async () => {
      const msg = await interaction.fetchReply();
      for (let i = 0; i < options.length && i < 10; i++) await msg.react(emojis[i]);
    });
  }
  else if (commandName === 'serverinfo') {
    const g = interaction.guild;
    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .addFields(
        { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
        { name: 'Members', value: `${g.memberCount}`, inline: true },
        { name: 'Channels', value: `${g.channels.cache.size}`, inline: true },
        { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
        { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
      )
      .setThumbnail(g.iconURL())
      .setColor(0x5865F2);
    interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'userinfo') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild?.members.cache.get(user.id);
    const embed = new EmbedBuilder()
      .setTitle(user.tag)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Joined', value: member ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A', inline: true },
      )
      .setThumbnail(user.displayAvatarURL())
      .setColor(0x5865F2);
    interaction.reply({ embeds: [embed] });
  }
  else if (commandName === 'avatar') {
    const user = interaction.options.getUser('user') || interaction.user;
    interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${user.tag}'s Avatar`).setImage(user.displayAvatarURL({ size: 512 })).setColor(0x5865F2)] });
  }
  else if (commandName === 'remind') {
    const minutes = interaction.options.getInteger('minutes');
    const msg = interaction.options.getString('message');
    interaction.reply(`⏰ Reminder set for ${minutes} minute(s)!`);
    setTimeout(() => interaction.user.send(`⏰ Reminder: ${msg}`).catch(() => {}), minutes * 60000);
  }
  else if (commandName === 'clear') {
    const amount = interaction.options.getInteger('amount');
    interaction.channel.bulkDelete(amount, true).then(d => {
      interaction.reply(`Deleted ${d.size} messages.`).then(() => setTimeout(() => interaction.deleteReply(), 3000));
    });
  }
  else if (commandName === 'kick') {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason';
    interaction.guild.members.kick(user.id, reason).then(() => {
      interaction.reply(`Kicked ${user.tag}: ${reason}`);
    }).catch(e => interaction.reply(`Failed: ${e.message}`));
  }
  else if (commandName === 'ban') {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason';
    interaction.guild.members.ban(user.id, { reason }).then(() => {
      interaction.reply(`Banned ${user.tag}: ${reason}`);
    }).catch(e => interaction.reply(`Failed: ${e.message}`));
  }
  else if (commandName === 'timeout') {
    const user = interaction.options.getUser('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || 'No reason';
    interaction.guild.members.timeout(user.id, minutes * 60000, reason).then(() => {
      interaction.reply(`Timed out ${user.tag} for ${minutes}m: ${reason}`);
    }).catch(e => interaction.reply(`Failed: ${e.message}`));
  }
  else if (commandName === 'createchannel') {
    const name = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-');
    interaction.guild.channels.create({ name, type: ChannelType.GuildText }).then(ch => {
      interaction.reply(`✅ Created <#${ch.id}>`);
    }).catch(e => interaction.reply(`Failed: ${e.message}`));
  }
  else if (commandName === 'deletechannel') {
    const input = interaction.options.getString('name');
    const ch = interaction.guild.channels.cache.find(c => c.name === input || c.id === input);
    if (ch) ch.delete().then(() => interaction.reply(`✅ Deleted #${ch.name}`));
    else interaction.reply('❌ Channel not found.');
  }
}

// ========== MESSAGE HANDLER ==========

async function handleMessage(message) {
  if (message.author.bot) return;
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);
  cleanCache();

  const content = message.content.trim();
  if (!content) return;

  const isDM = !message.guild;
  const isMentioned = client.user && message.mentions.has(client.user);

  if (!isDM && !isMentioned) return;

  let userMessage = content;
  if (isMentioned) {
    userMessage = content.replace(/<@!?\d+>/g, '').trim();
    if (!userMessage) userMessage = 'Hey!';
  }

  const ownerStatus = isOwner(message) ? ' [OWNER]' : '';
  console.log(`[${isDM ? 'DM' : 'SERVER'}] ${message.author.tag}${ownerStatus}: ${userMessage}`);

  try {
    await message.channel.sendTyping();
  } catch {}

  const { text, action } = await askGemini(
    userMessage,
    message.author.username,
    message.author.id,
    message.guild?.name,
    message.channelId,
    isDM,
    message.guild
  );

  let finalReply = text;

  if (action) {
    console.log(`[ACTION] ${message.author.tag} requested: ${action.action} -> ${action.target}`);

    if (!isOwner(message)) {
      finalReply = "Only my owner can give me server commands. Nice try though! 😏";
    } else {
      const result = await executeAction(action, message);
      if (result) {
        finalReply = `${text}\n\n${result}`;
      } else {
        finalReply = `${text}\n\n⚠️ I recognized the action but couldn't execute it.`;
      }
    }
  }

  try {
    if (finalReply.length > 2000) {
      for (let i = 0; i < finalReply.length; i += 2000) {
        await message.reply(finalReply.substring(i, i + 2000));
      }
    } else {
      await message.reply(finalReply);
    }
  } catch {
    try {
      await message.channel.send(finalReply.substring(0, 2000));
    } catch {}
  }

  console.log(`[AI] Replied to ${message.author.tag} (${finalReply.length} chars)`);
}

// ========== BOT START ==========

client.once('ready', () => {
  console.log(`\n========================================`);
  console.log(`  Majnoun-Bot is ONLINE!`);
  console.log(`  Tag: ${client.user.tag}`);
  console.log(`  Guilds: ${client.guilds.cache.size}`);
  console.log(`  Owner ID: ${OWNER_ID}`);
  console.log(`========================================\n`);
  client.user.setPresence({
    status: 'online',
    activities: [{ name: 'DM me or mention me!', type: 4 }],
  });

  if (OWNER_ID) {
    client.users.fetch(OWNER_ID).then(user => {
      user.send(
        `🤖 **Majnoun-Bot is ONLINE!**\n\n` +
        `I recognize you as my owner. I have real server management abilities now.\n\n` +
        `**How to use me:**\n` +
        `• DM me anything — I'll respond with AI\n` +
        `• Mention me in any channel — I'll reply\n` +
        `• Ask me to do things on the server — I'll actually do them\n` +
        `• Use /help to see all commands\n\n` +
        `I'm your AI assistant with REAL powers! 💪`
      ).catch(() => {});
    }).catch(() => {});
  }
});

client.on('messageCreate', async (message) => {
  try {
    await handleMessage(message);
  } catch (e) {
    console.error('[Message Error]', e.message);
  }
});

client.on('interactionCreate', (interaction) => {
  try {
    handleCommand(interaction);
  } catch (e) {
    console.error('[Command Error]', e.message);
  }
});

// ========== WEB SERVER ==========

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ status: 'Majnoun-Bot Online', uptime: process.uptime() }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

app.listen(PORT, '0.0.0.0', () => console.log(`Web server on port ${PORT}`));

// ========== START ==========

registerCommands();
client.login(TOKEN);
