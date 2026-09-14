
// ======================
// DHBT POLL SYSTEM
// Dashboard-created anonymous Discord polls.
// Publicly only option counts are shown; voter identities are kept for the team dashboard.
// ======================
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const guildStorage = require("./guildStorage");

const FILE = "polls.json";
const MAX_OPTIONS = 25;
const MIN_OPTIONS = 2;
const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
let activeTimers = new Map();

function load(guildId) {
  const data = guildStorage.loadGuildJson(guildId, FILE, { polls: {} });
  if (!data || typeof data !== "object") return { polls: {} };
  if (!data.polls || typeof data.polls !== "object") data.polls = {};
  return data;
}

function save(guildId, data) {
  guildStorage.saveGuildJsonSync(guildId, FILE, data);
}

function makeId() {
  return `poll_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((o, i) => ({
    label: String(o?.label || `Option ${i + 1}`).trim().slice(0, 80),
    emoji: String(o?.emoji || "").trim().slice(0, 32),
  })).filter(o => o.label);
}

function validateOptions(options) {
  if (options.length < MIN_OPTIONS) throw new Error(`Mindestens ${MIN_OPTIONS} Antwortmöglichkeiten erforderlich`);
  if (options.length > MAX_OPTIONS) throw new Error(`Maximal ${MAX_OPTIONS} Antwortmöglichkeiten möglich`);
  const seen = new Set();
  for (const o of options) {
    if (!o.emoji) throw new Error("Jede Antwortmöglichkeit benötigt ein Emoji");
    if (seen.has(o.emoji)) throw new Error(`Emoji doppelt verwendet: ${o.emoji}`);
    seen.add(o.emoji);
  }
}

function makeComponents(poll, disabled = false) {
  const rows = [];
  for (let i = 0; i < poll.options.length; i += 5) {
    const row = new ActionRowBuilder();
    for (let j = i; j < Math.min(i + 5, poll.options.length); j++) {
      const o = poll.options[j];
      const b = new ButtonBuilder()
        .setCustomId(`dhbt_poll:${poll.id}:${j}`)
        .setLabel(o.label.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
      if (o.emoji) b.setEmoji(o.emoji);
      row.addComponents(b);
    }
    rows.push(row);
  }
  return rows;
}

function counts(poll) {
  return poll.options.map((_, i) =>
    Object.values(poll.votes || {}).reduce((n, vote) => {
      const arr = Array.isArray(vote) ? vote : [vote];
      return n + (arr.includes(i) ? 1 : 0);
    }, 0)
  );
}

function legend(poll) {
  return poll.options.map(o => `${o.emoji} = **${o.label}**`).join("\n");
}

function buildActiveEmbed(poll) {
  const embed = new EmbedBuilder()
    .setTitle(poll.title || "Abstimmung")
    .setDescription(poll.description || "")
    .setColor(0x4DA3FF)
    .addFields(
      { name: "🗳️ Antworten", value: legend(poll), inline: false },
      { name: "⏳ Ende", value: `<t:${Math.floor(poll.endsAt / 1000)}:R>`, inline: true },
      { name: "📌 Mehrere Antworten", value: poll.multiple ? "Ja" : "Nein", inline: true }
    )
    .setFooter({ text: "DHBT Abstimmung • Stimmen sind für andere User anonym" })
    .setTimestamp(poll.createdAt);
  return embed;
}

function buildFinishedEmbed(poll) {
  const c = counts(poll);
  const total = Object.keys(poll.votes || {}).length;
  const max = Math.max(...c);
  const winners = max > 0 ? poll.options.map((o, i) => i).filter(i => c[i] === max) : [];
  const winnerText = max <= 0
    ? "Keine Stimmen"
    : winners.length > 1
      ? `Gleichstand: ${winners.map(i => `${poll.options[i].emoji} **${poll.options[i].label}**`).join(", ")}`
      : `${poll.options[winners[0]].emoji} **${poll.options[winners[0]].label}**`;

  const resultLines = poll.options.map((o, i) =>
    `${o.emoji} **${o.label}** — **${c[i]}** Stimme${c[i] === 1 ? "" : "n"}`
  );

  return new EmbedBuilder()
    .setTitle(`${poll.title || "Abstimmung"} • Beendet`)
    .setDescription(poll.description || "")
    .setColor(0x3BA55C)
    .addFields(
      { name: "📊 Ergebnis", value: resultLines.join("\n"), inline: false },
      { name: "🏆 Gewinner", value: winnerText, inline: false },
      { name: "👥 Teilnehmer", value: String(total), inline: true },
      { name: "🔒 Abstimmung", value: poll.secret ? "Geheim" : "Nicht geheim", inline: true }
    )
    .setFooter({ text: "DHBT Abstimmung • Beendet" })
    .setTimestamp(poll.endsAt);
}

async function editMessage(client, poll, finished = false) {
  if (!client || !poll.channelId || !poll.messageId) return false;
  const channel = await client.channels.fetch(poll.channelId).catch(() => null);
  if (!channel || typeof channel.messages?.fetch !== "function") return false;
  const msg = await channel.messages.fetch(poll.messageId).catch(() => null);
  if (!msg) return false;
  await msg.edit({
    embeds: [finished ? buildFinishedEmbed(poll) : buildActiveEmbed(poll)],
    components: finished ? makeComponents(poll, true) : makeComponents(poll, false)
  });
  return true;
}

async function finish(client, guildId, pollId) {
  const data = load(guildId);
  const poll = data.polls[pollId];
  if (!poll || poll.status !== "active") return null;
  poll.status = "finished";
  poll.finishedAt = Date.now();
  const c = counts(poll);
  poll.counts = c;
  poll.winners = c.length ? c.map((v, i) => i).filter(i => v === Math.max(...c) && v > 0) : [];
  save(guildId, data);
  await editMessage(client, poll, true).catch(err => console.error(`[POLL] Finish edit failed: ${err.message}`));
  activeTimers.delete(pollId);
  return poll;
}

function schedule(client, guildId, poll) {
  if (!poll || poll.status !== "active") return;
  if (activeTimers.has(poll.id)) clearTimeout(activeTimers.get(poll.id));
  const delay = Math.max(1000, poll.endsAt - Date.now());
  activeTimers.set(poll.id, setTimeout(() => finish(client, guildId, poll.id).catch(() => {}), delay));
}

async function create(client, guildId, input) {
  if (!guildId) throw new Error("Keine Guild angegeben");
  const title = String(input.title || "").trim().slice(0, 256);
  const description = String(input.description || "").trim().slice(0, 4000);
  const options = normalizeOptions(input.options);
  validateOptions(options);
  if (!title) throw new Error("Titel erforderlich");

  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("Ungültige Dauer");
  const durationMs = Math.min(durationMinutes * 60 * 1000, MAX_DURATION_MS);

  const channelId = String(input.channelId || "");
  if (!channelId) throw new Error("Channel erforderlich");

  const roleIds = Array.isArray(input.roleIds) ? input.roleIds.map(String).filter(Boolean) : [];
  const poll = {
    id: makeId(),
    guildId,
    channelId,
    roleIds,
    title,
    description,
    options,
    durationMinutes: durationMs / 60000,
    createdAt: Date.now(),
    endsAt: Date.now() + durationMs,
    multiple: !!input.multiple,
    secret: input.secret !== false,
    status: "active",
    votes: {},
    counts: options.map(() => 0),
    winners: [],
    createdBy: String(input.createdBy || "dashboard"),
    messageId: null
  };

  const clientChannel = client ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (!clientChannel || typeof clientChannel.send !== "function") throw new Error("Channel nicht gefunden oder keine Text-Kanal");

  const mentions = roleIds.map(id => `<@&${id}>`).join(" ");
  const message = await clientChannel.send({
    content: mentions || undefined,
    embeds: [buildActiveEmbed(poll)],
    components: makeComponents(poll),
    allowedMentions: { roles: roleIds }
  });
  poll.messageId = message.id;

  const data = load(guildId);
  data.polls[poll.id] = poll;
  save(guildId, data);
  schedule(client, guildId, poll);
  return poll;
}

async function handleButton(interaction) {
  const parts = String(interaction.customId || "").split(":");
  if (parts.length !== 3 || parts[0] !== "dhbt_poll") return false;
  const pollId = parts[1];
  const optionIndex = Number(parts[2]);
  const guildId = interaction.guildId;
  const data = load(guildId);
  const poll = data.polls[pollId];
  if (!poll || poll.status !== "active") {
    await interaction.reply({ content: "❌ Diese Abstimmung ist bereits beendet.", flags: 64 }).catch(() => {});
    return true;
  }
  if (Date.now() >= poll.endsAt) {
    await finish(interaction.client, guildId, pollId);
    await interaction.reply({ content: "❌ Diese Abstimmung ist gerade beendet worden.", flags: 64 }).catch(() => {});
    return true;
  }
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) return true;

  const userId = interaction.user.id;
  let selected = Array.isArray(poll.votes[userId]) ? [...poll.votes[userId]] : [];
  if (poll.multiple) {
    if (selected.includes(optionIndex)) selected = selected.filter(i => i !== optionIndex);
    else selected.push(optionIndex);
  } else {
    selected = [optionIndex];
  }

  if (!selected.length) delete poll.votes[userId];
  else poll.votes[userId] = selected;
  poll.counts = counts(poll);
  save(guildId, data);

  const names = selected.map(i => poll.options[i].label).join(", ");
  await interaction.reply({
    content: selected.length ? `✅ Deine Auswahl: **${names}**` : "✅ Deine Auswahl wurde entfernt.",
    flags: 64
  }).catch(() => {});
  return true;
}

function list(guildId) {
  const data = load(guildId);
  return Object.values(data.polls || {})
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(p => {
      const c = counts(p);
      const voters = Object.entries(p.votes || {}).map(([userId, choices]) => ({
        userId,
        choices: (Array.isArray(choices) ? choices : [choices]).filter(i => Number.isInteger(i))
      }));
      return {
        ...p,
        counts: c,
        voterDetails: p.secret ? voters : voters
      };
    });
}

function get(guildId, pollId) {
  const p = list(guildId).find(x => x.id === pollId);
  return p || null;
}

async function init(client) {
  for (const guild of client.guilds.cache.values()) {
    const data = load(guild.id);
    for (const poll of Object.values(data.polls || {})) {
      if (poll.status === "active") {
        if (Date.now() >= poll.endsAt) await finish(client, guild.id, poll.id);
        else schedule(client, guild.id, poll);
      }
    }
  }
  console.log("[POLL] Poll-System initialisiert.");
}

module.exports = {
  MAX_OPTIONS,
  MIN_OPTIONS,
  init,
  create,
  handleButton,
  list,
  get,
  finish,
  buildActiveEmbed,
  buildFinishedEmbed,
  counts
};
