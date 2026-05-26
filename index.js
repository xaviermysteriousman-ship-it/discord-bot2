require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

const commands = [
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with Pong!"),

    new SlashCommandBuilder()
        .setName("hello")
        .setDescription("Say hello to the bot")
]
.map(command => command.toJSON());

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);

    try {
        console.log("Registering slash commands...");

        const rest = new REST({ version: "10" })
            .setToken(process.env.TOKEN2);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log("Slash commands registered.");
    }
    catch (err) {
        console.error(err);
    }
});

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ping") {
        await interaction.reply("Pong!");
    }

    if (interaction.commandName === "hello") {
        await interaction.reply(
            `Hello ${interaction.user.username}!`
        );
    }

});

client.login(process.env.TOKEN2);
