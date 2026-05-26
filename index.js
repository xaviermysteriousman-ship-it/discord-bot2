require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// simple in-memory user store (YOU CAN upgrade later to JSON/db)
const optedInUsers = new Set();

const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!"),

    new SlashCommandBuilder()
        .setName("hello")
        .setDescription("Say hello to the bot"),

    new SlashCommandBuilder()
        .setName("optin")
        .setDescription("Allow receiving DM broadcasts from this app"),

    new SlashCommandBuilder()
        .setName("optout")
        .setDescription("Stop receiving DM broadcasts"),

    new SlashCommandBuilder()
        .setName("postmessage")
        .setDescription("Send a DM broadcast to all opted-in users")
        .addStringOption(opt =>
            opt.setName("message")
                .setDescription("Message to send")
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN2);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash commands registered.");
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // track anyone who interacts
    optedInUsers.add(interaction.user.id);

    if (commandName === "ping") {
        return interaction.reply("Pong!");
    }

    if (commandName === "hello") {
        return interaction.reply(`Hello ${interaction.user.username}!`);
    }

    if (commandName === "optin") {
        optedInUsers.add(interaction.user.id);
        return interaction.reply({ content: "You are now opted in for DM broadcasts.", ephemeral: true });
    }

    if (commandName === "optout") {
        optedInUsers.delete(interaction.user.id);
        return interaction.reply({ content: "You have been removed from DM broadcasts.", ephemeral: true });
    }

    if (commandName === "postmessage") {
        const message = interaction.options.getString("message");

        const senderUsername = interaction.user.username;
        const senderDisplay =
            interaction.member?.displayName || interaction.user.globalName || interaction.user.username;

        await interaction.reply({
            content: `Sending DM broadcast to ${optedInUsers.size} users...`,
            ephemeral: true
        });

        let success = 0;
        let failed = 0;

        for (const userId of optedInUsers) {
            try {
                const user = await client.users.fetch(userId);

                await user.send(
                    `📢 **Broadcast Message**\n` +
                    `From: ${senderUsername} (${senderDisplay})\n\n` +
                    `${message}`
                );

                success++;
            } catch (err) {
                failed++;
                console.log(`Failed to DM ${userId}:`, err.message);
            }
        }

        console.log(`Broadcast done. Success: ${success}, Failed: ${failed}`);
    }
});

client.login(process.env.TOKEN2);
