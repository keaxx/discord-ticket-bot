require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
} = require('discord.js');

const config = require('./config.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// ---------- Slash Commands ----------
const commands = [
  new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Send the ticket panel in the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket.')
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('⏳ Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, config.guildId),
      { body: commands }
    );
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
}

// ---------- Ticket Panel ----------
function buildPanel() {
  const embed = new EmbedBuilder()
    .setTitle(config.embed.title)
    .setDescription(config.embed.description)
    .setColor(config.embed.color)
    .setFooter({ text: 'One ticket per user at a time' });

  const options = [
    ...config.items.map((item) => ({
      label: item.label,
      description: item.description,
      value: item.id,
      emoji: item.emoji,
    })),
    {
      label: config.support.label,
      description: config.support.description,
      value: config.support.id,
      emoji: config.support.emoji,
    },
  ];

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_menu')
    .setPlaceholder('Select a ticket type...')
    .addOptions(options);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

// ---------- Ticket Creation ----------
async function createTicket(interaction, type) {
  const { guild, user } = interaction;

  // Prevent duplicate tickets
  const existing = guild.channels.cache.find(
    (c) =>
      c.parentId === config.ticketCategoryId &&
      c.topic === `ticket-${user.id}`
  );

  if (existing) {
    return interaction.reply({
      content: `❌ You already have an open ticket: ${existing}`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const typeData =
    config.items.find((i) => i.id === type) ||
    (type === config.support.id ? config.support : null);

  if (!typeData) {
    return interaction.editReply({ content: '❌ Invalid ticket type.' });
  }

  const channelName = `ticket-${user.username}`.toLowerCase().slice(0, 90);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    topic: `ticket-${user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: config.supportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  const isPurchase = type !== config.support.id;

  const embed = new EmbedBuilder()
    .setTitle(
      isPurchase
        ? `🛒 Purchase Ticket — ${typeData.label}`
        : `🛠️ Support Ticket`
    )
    .setDescription(
      isPurchase
        ? `Hey ${user}, thanks for your interest in **${typeData.label}**!\n\n` +
            `A staff member will be with you shortly to process your purchase. ` +
            `Please share your preferred payment method and any details we need.`
        : `Hey ${user}, welcome to support!\n\n` +
            `Please describe your issue in detail and a staff member will assist you shortly.`
    )
    .setColor(config.embed.color)
    .setTimestamp();

  const closeBtn = new ButtonBuilder()
    .setCustomId('close_ticket')
    .setLabel('Close Ticket')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔒');

  await channel.send({
    content: `${user} <@&${config.supportRoleId}>`,
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(closeBtn)],
  });

  await interaction.editReply({
    content: `✅ Your ticket has been created: ${channel}`,
  });

  // Log
  const logChannel = guild.channels.cache.get(config.logChannelId);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setTitle('📥 Ticket Opened')
      .setColor('#57F287')
      .addFields(
        { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
        { name: 'Type', value: typeData.label, inline: true },
        { name: 'Channel', value: `${channel}`, inline: true }
      )
      .setTimestamp();
    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }
}

// ---------- Ticket Close ----------
async function closeTicket(interaction) {
  const { channel, user } = interaction;

  if (!channel.topic?.startsWith('ticket-')) {
    return interaction.reply({
      content: '❌ This command can only be used inside a ticket channel.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setDescription(`🔒 Ticket will be closed in 5 seconds...`)
        .setColor('#ED4245'),
    ],
  });

  const logChannel = interaction.guild.channels.cache.get(config.logChannelId);
  if (logChannel) {
    const ownerId = channel.topic.replace('ticket-', '');
    const logEmbed = new EmbedBuilder()
      .setTitle('📤 Ticket Closed')
      .setColor('#ED4245')
      .addFields(
        { name: 'Ticket', value: `\`${channel.name}\``, inline: true },
        { name: 'Owner', value: `<@${ownerId}>`, inline: true },
        { name: 'Closed By', value: `${user}`, inline: true }
      )
      .setTimestamp();
    logChannel.send({ embeds: [logEmbed] }).catch(() => {});
  }

  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// ---------- Event Handlers ----------
client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('tickets 🎫', { type: 3 });
  await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash Commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup-tickets') {
        await interaction.channel.send(buildPanel());
        return interaction.reply({
          content: '✅ Ticket panel sent.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'close') {
        return closeTicket(interaction);
      }
    }

    // Dropdown Selection
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      const choice = interaction.values[0];
      await createTicket(interaction, choice);

      // Reset the dropdown so it can be used again
      const message = interaction.message;
      if (message.editable) {
        await message.edit(buildPanel()).catch(() => {});
      }
    }

    // Close Button
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      return closeTicket(interaction);
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable() && !interaction.replied) {
      interaction
        .reply({ content: '❌ Something went wrong.', ephemeral: true })
        .catch(() => {});
    }
  }
});

// ---------- Login ----------
client.login(process.env.DISCORD_TOKEN);
