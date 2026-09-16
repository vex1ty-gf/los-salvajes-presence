const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN est manquant.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const DATA_FILE = "./presence.json";

let data = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    data = {};
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function createEmbed(guild, guildData) {
  const statuses = {
    present: [],
    late: [],
    absent: []
  };

  for (const [userId, status] of Object.entries(guildData.members || {})) {
    if (statuses[status]) {
      statuses[status].push(`<@${userId}>`);
    }
  }

  return new EmbedBuilder()
    .setTitle(`📋 PRÉSENCES — ${guild.name}`)
    .setDescription(
      `🟢 **Présents (${statuses.present.length})**\n` +
      (statuses.present.length ? statuses.present.join("\n") : "Aucun") +
      `\n\n` +
      `🟠 **Retards (${statuses.late.length})**\n` +
      (statuses.late.length ? statuses.late.join("\n") : "Aucun") +
      `\n\n` +
      `🔴 **Absents (${statuses.absent.length})**\n` +
      (statuses.absent.length ? statuses.absent.join("\n") : "Aucun")
    )
    .setFooter({
      text: "Clique sur ton statut pour modifier ta présence."
    })
    .setTimestamp();
}

function createButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("presence_present")
      .setLabel("Présent")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("presence_late")
      .setLabel("Retard")
      .setEmoji("🟠")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("presence_absent")
      .setLabel("Absent")
      .setEmoji("🔴")
      .setStyle(ButtonStyle.Danger)
  );
}

client.once("ready", async () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);

  // Enregistre /presence setup directement dans le premier serveur
  const guild = client.guilds.cache.first();

  if (guild) {
    const command = new SlashCommandBuilder()
      .setName("presence")
      .setDescription("Gestion des présences")
      .addSubcommand(sub =>
        sub
          .setName("setup")
          .setDescription("Créer le panneau des présences")
      );

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    try {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guild.id),
        {
          body: [command.toJSON()]
        }
      );

      console.log("✅ Commande /presence enregistrée.");
    } catch (error) {
      console.error("❌ Erreur commande :", error);
    }
  }
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (
      interaction.commandName === "presence" &&
      interaction.options.getSubcommand() === "setup"
    ) {
      const guild = interaction.guild;

      if (!guild) return;

      data[guild.id] = {
        channelId: interaction.channel.id,
        messageId: null,
        members: {}
      };

      const message = await interaction.channel.send({
        embeds: [createEmbed(guild, data[guild.id])],
        components: [createButtons()]
      });

      data[guild.id].messageId = message.id;
      saveData();

      await interaction.reply({
        content: "✅ Le panneau des présences a été créé.",
        ephemeral: true
      });
    }

    return;
  }

  if (interaction.isButton()) {
    const guild = interaction.guild;

    if (!guild || !data[guild.id]) {
      return interaction.reply({
        content: "❌ Le système de présence n'est pas configuré.",
        ephemeral: true
      });
    }

    let status;

    if (interaction.customId === "presence_present") {
      status = "present";
    }

    if (interaction.customId === "presence_late") {
      status = "late";
    }

    if (interaction.customId === "presence_absent") {
      status = "absent";
    }

    if (!status) return;

    data[guild.id].members[interaction.user.id] = status;
    saveData();

    try {
      const channel = await client.channels.fetch(
        data[guild.id].channelId
      );

      const message = await channel.messages.fetch(
        data[guild.id].messageId
      );

      await message.edit({
        embeds: [createEmbed(guild, data[guild.id])],
        components: [createButtons()]
      });
    } catch (error) {
      console.error("Erreur mise à jour :", error);
    }

    await interaction.reply({
      content:
        status === "present"
          ? "🟢 Tu es enregistré comme présent."
          : status === "late"
          ? "🟠 Tu es enregistré comme en retard."
          : "🔴 Tu es enregistré comme absent.",
      ephemeral: true
    });
  }
});

client.login(TOKEN);
