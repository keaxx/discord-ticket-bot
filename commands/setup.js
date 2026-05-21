const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup-tickets')
    .setDescription('Send the ticket panel in the current channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  async execute(interaction, client, config) {
    // Build the ticket panel embed
    const embed = new EmbedBuilder()
      .setTitle(config.embed.title)
      .setDescription(config.embed.description)
      .setColor(config.embed.color)
      .setFooter({ text: 'One ticket per user at a time' });

    // Build the select menu options
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

    // Send the panel
    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)],
    });

    // Reply to the command user
    await interaction.reply({
      content: '✅ Ticket panel has been sent to this channel!',
      ephemeral: true,
    });
  },
};
