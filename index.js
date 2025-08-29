require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    PermissionsBitField
} = require('discord.js');

const prefix = "!";
const ticket = {
    color: "#4B0082", // violet foncé
    footer: "Click the button to close the ticket",
    autoCloseHours: 24,
    maxTicketsPerUser: 1
};

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel],
});

// Crée le dossier transcripts s'il n'existe pas
if (!fs.existsSync(path.join(__dirname, 'transcripts'))) {
    fs.mkdirSync(path.join(__dirname, 'transcripts'));
}

client.once('ready', () => {
    console.log(`${client.user.tag} is connected!`);
});

// Commande ticket
client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "ticket") {
        const allowedRoleId = "1405636625236758549";
        if (!message.member.roles.cache.has(allowedRoleId) && message.author.id !== message.guild.ownerId) {
            return message.reply("❌ You do not have permission to create a ticket.");
        }

        // Vérifie si l'utilisateur a déjà un ticket ouvert
        const existingTicket = message.guild.channels.cache.find(c =>
            c.name.startsWith(`ticket-${message.author.username.toLowerCase()}`)
        );
        if (existingTicket && message.author.id !== message.guild.ownerId) {
            return message.reply("❌ You already have an open ticket. You can only have 1 ticket at a time.");
        }

        const categories = [
            { name: "Buy", description: "Buy a product", emoji: { id: "1410844022100070531", name: "money2" }, value: "buy" },
            { name: "Help", description: "Need help or have a question", emoji: { id: "1410844002399551532", name: "support48" }, value: "help" },
            { name: "Media creator", description: "Become a media creator or sell your account", emoji: { id: "1410843985542643865", name: "console_pc" }, value: "media" }
        ];

        const embed = new EmbedBuilder()
            .setDescription(
`Select a category for your ticket by clicking the corresponding button:
- **Buy : Buy a product**
- **Help : Need help or have a question**
- **Media creator : Become a media creator or sell your account**`
            )
            .setColor(ticket.color)
            .setThumbnail("https://media.discordapp.net/attachments/1409655945650503692/1410842636973113354/zak_services_pfp.png?format=webp")
            .setImage("https://media.discordapp.net/attachments/1371120615016366102/1410388505468600411/ZS.png?format=webp")
            .setFooter({ text: ticket.footer });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("ticket_select")
            .setPlaceholder("Select a category")
            .addOptions(categories.map(c => ({
                label: c.name,
                description: c.description,
                value: c.value,
                emoji: c.emoji
            })));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await message.channel.send({ embeds: [embed], components: [row] });
    }
});

// Interaction select menu
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === "ticket_select") {
        const selected = interaction.values[0];
        const categoriesMap = {
            buy: { name: "Buy", description: "Buy a product" },
            help: { name: "Help", description: "Need help or have a question" },
            media: { name: "Media creator", description: "Become a media creator or sell your account" }
        };

        const category = categoriesMap[selected];
        if (!category) return;

        // Vérifie si l'utilisateur a déjà un ticket ouvert
        const existingTicket = interaction.guild.channels.cache.find(c =>
            c.name.startsWith(`ticket-${interaction.user.username.toLowerCase()}`)
        );
        if (existingTicket && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: "❌ You already have an open ticket. You can only have 1 ticket at a time.", ephemeral: true });
        }

        // Crée salon privé
        const channel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}-${category.name}`,
            type: 0,
            parent: "1405636626498977932",
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`${interaction.user.username} - ${category.name}`)
            .setDescription(category.description)
            .setColor(ticket.color)
            .setThumbnail("https://media.discordapp.net/attachments/1409655945650503692/1410842636973113354/zak_services_pfp.png?format=webp")
            .setImage("https://media.discordapp.net/attachments/1371120615016366102/1410388505468600411/ZS.png?format=webp")
            .setFooter({ text: ticket.footer });

        const closeButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("close_ticket")
                .setLabel("Close Ticket")
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed], components: [closeButton] });
        await interaction.reply({ content: `Your ticket for **${category.name}** has been created!`, ephemeral: true });

        setTimeout(async () => {
            if (channel) {
                await channel.send("⏰ This ticket is automatically closed after 24h.");
                await closeTicket(channel);
            }
        }, ticket.autoCloseHours * 60 * 60 * 1000);
    }

    if (interaction.isButton() && interaction.customId === "close_ticket") {
        await closeTicket(interaction.channel);
        await interaction.reply({ content: "The ticket is closed! ✅", ephemeral: true });
    }
});

// Fonction de fermeture avec transcript
async function closeTicket(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const content = messages.map(m => `[${m.author.tag}] : ${m.content}`).reverse().join("\n");

        const filePath = path.join(__dirname, 'transcripts', `transcript-${channel.id}.txt`);
        fs.writeFileSync(filePath, content);

        await channel.delete();
    } catch (err) {
        console.error("Error closing ticket:", err);
    }
}

client.login(process.env.TOKEN);
