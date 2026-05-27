require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionFlagsBits,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const token = process.env.DISCORD_TOKEN || process.env.TOKEN2;
const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
const ownerIds = new Set(
    (process.env.OWNER_IDS || "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
);

if (!token) {
    throw new Error("Missing DISCORD_TOKEN in .env. TOKEN2 is also supported for your old setup.");
}

const DATA_FILE = path.join(__dirname, "opted-in-users.json");

// Discord API values. Kept inline so this works across more discord.js v14 versions.
const ApplicationIntegrationType = {
    GuildInstall: 0,
    UserInstall: 1
};

const InteractionContextType = {
    Guild: 0,
    BotDM: 1,
    PrivateChannel: 2
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

const optedInUsers = new Set();

function commandEverywhere(command) {
    return {
        ...command.toJSON(),
        integration_types: [
            ApplicationIntegrationType.GuildInstall,
            ApplicationIntegrationType.UserInstall
        ],
        contexts: [
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel
        ]
    };
}

const commands = [
    commandEverywhere(
        new SlashCommandBuilder()
            .setName("job")
            .setDescription("tells you your daily job")
    ),

    commandEverywhere(
        new SlashCommandBuilder()
            .setName("speak-with-senior")
            .setDescription("request to speak with a senior")
    ),

    commandEverywhere(
        new SlashCommandBuilder()
            .setName("agree-to-terms")
            .setDescription("agree to the terms")
    ),

    commandEverywhere(
        new SlashCommandBuilder()
            .setName("leave")
            .setDescription("leave the team.")
    ),

    commandEverywhere(
        new SlashCommandBuilder()
            .setName("postmessage")
            .setDescription("Send a DM broadcast to all opted-in users")
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addStringOption(option =>
                option
                    .setName("message")
                    .setDescription("Message to send")
                    .setRequired(true)
                    .setMaxLength(1800)
            )
    )
];

async function loadOptIns() {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf8");
        const ids = JSON.parse(raw);

        if (!Array.isArray(ids)) {
            throw new Error("opted-in-users.json must contain a JSON array.");
        }

        optedInUsers.clear();
        for (const id of ids) {
            if (typeof id === "string") optedInUsers.add(id);
        }
    } catch (err) {
        if (err.code !== "ENOENT") throw err;
    }
}

async function saveOptIns() {
    await fs.writeFile(
        DATA_FILE,
        `${JSON.stringify([...optedInUsers], null, 2)}\n`,
        "utf8"
    );
}

async function registerCommands() {
    const applicationId = clientId || client.application?.id || client.user?.id;

    if (!applicationId) {
        throw new Error("Could not determine application id. Set DISCORD_CLIENT_ID in .env.");
    }

    const rest = new REST({ version: "10" }).setToken(token);
    await rest.put(Routes.applicationCommands(applicationId), { body: commands });
}

function canBroadcast(interaction) {
    if (ownerIds.size > 0) {
        return ownerIds.has(interaction.user.id);
    }

    return Boolean(
        interaction.inGuild()
        && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    );
}

function getSenderDisplay(interaction) {
    return (
        interaction.member?.displayName
        || interaction.user.globalName
        || interaction.user.username
    );
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Loaded ${optedInUsers.size} opted-in users.`);

    try {
        await registerCommands();
        console.log("Global slash commands registered.");
    } catch (err) {
        console.error("Failed to register slash commands:", err);
    }
});

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const { commandName } = interaction;

        if (commandName === "speak-to-senior") {
            await interaction.reply("Requesting...");
            setTimeout(() => {
                await interaction.reply("Your request was denied. You are not high enough of a rank.");
            }, 6000);
            return;
        }

        if (commandName === "job") {
            await interaction.reply("Your job for today is: spread the message of Blueberry Pie.");
            return;
        }

        if (commandName === "agree-to-terms") {
            optedInUsers.add(interaction.user.id);
            await saveOptIns();
            await interaction.reply({
                content: "You are now rank: Junior 118 in discord.",
                ephemeral: true
            });
            return;
        }

        if (commandName === "leave") {
            optedInUsers.delete(interaction.user.id);
            await saveOptIns();
            await interaction.reply({
                content: "You have been removed from our ranks.",
                ephemeral: true
            });
            return;
        }

        if (commandName === "postmessage") {
            if (!canBroadcast(interaction)) {
                await interaction.reply({
                    content: "You are not allowed to send broadcasts. Add your Discord user ID to OWNER_IDS in .env, or use this in a server where you have Manage Server.",
                    ephemeral: true
                });
                return;
            }

            const message = interaction.options.getString("message", true);
            const senderUsername = interaction.user.username;
            const senderDisplay = getSenderDisplay(interaction);

            await interaction.deferReply({ ephemeral: true });

            let success = 0;
            let failed = 0;

            for (const userId of optedInUsers) {
                try {
                    const user = await client.users.fetch(userId);
                    await user.send({
                        content:
                            "[Broadcast Message]\n"
                            + `From: prateri1038 (Brother Prateri)\n\n`
                            + message,
                        allowedMentions: { parse: [] }
                    });
                    success++;
                } catch (err) {
                    failed++;
                    console.log(`Failed to DM ${userId}: ${err.message}`);
                }
            }

            await interaction.editReply(
                `Broadcast complete. Sent: ${success}. Failed: ${failed}.`
            );
        }
    } catch (err) {
        console.error("Interaction handler failed:", err);

        const errorMessage = {
            content: "Something went wrong while handling that command.",
            ephemeral: true
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(errorMessage.content).catch(() => null);
        } else {
            await interaction.reply(errorMessage).catch(() => null);
        }
    }
});

process.on("unhandledRejection", err => {
    console.error("Unhandled promise rejection:", err);
});

async function main() {
    await loadOptIns();
    await client.login(token);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
