// ======================
// BOT// ======================
// IMPORTS
// ======================
const _routeSalt = "MsxxqyxlathzIDKBYjtz";
const { Client, GatewayIntentBits, Partials, REST, Routes, EmbedBuilder } = require("discord.js");
const { db, RANKING_CHANNEL_ID, TEST_GUILD, Haupt_GUILD } = require("./config");
const { 
  handleSpielCommand, 
  handleSpielLoeschenCommand, 
  handleErgebnisCommand, 
  handleSpieleListen,
  handleTippsCommand,
  handleOwnerSetTipp,
  handleBadgeAddCommand,
  handleBadgeRemoveCommand,
  handleBadgesCommand,
  handleBadgeDisplaySelect,
  handleBadgeSelfRemoveCommand,
  handleRankTitleCommand,
  handleRankTitleCategorySelect,
  handleRankTitleSelect,
  handleResetAllCommand,
  handleSpielButton,
  handleTippModal,
  handleAdminCommand,
  handleCommandCommand,
  handleShopAddCommand,
  handleShopRemoveCommand,
  handleMissionResetCommand,
  handleChannelBlacklistCommand,
  handleLeaderboardBlacklistCommand,
  handleTippConfigCommand,
  handleSpielSelect,
  handleLeaderboardConfigCommand,
  getCommandSettings
} = require("./commands");

const { handleFeedbackCommand } = require("./feedbackCommand");
const { handleMarketInteraction } = require("./marketCommand");

const {
  handleEventCommand,
  handleEventCoinsTransfer
} = require("./events-commands");
const path = require("path");
const logger = require("./loggers");
const { isAdmin, isAllowedGuild, getVoiceMinutes } = require("./utils");
const { loadJson, saveJson, DATA_DIR } = require("./jsonStorage");
const economy = require("./economy");
const { handleDailyCommand } = require("./dailyRewards");
const badges = require("./badges");
const voiceTracker = require("./voiceTracker");
const xp = require("./xp");
const statsCache = require("./statsCache");
const shardMerchant = require("./shardMerchant");
const auctionNotifier = require("./auctionNotifier");
const auctionCommand = require("./auctionCommand");

function isVoiceChannelBlacklisted(guildId, channelId) {
  return !!channelId && economy.isChannelBlacklisted(guildId, channelId);
}

function safeDiscordError(message, client) {
  if (logger && typeof logger.discordError === "function") {
    try {
      logger.discordError(message, client);
    } catch (err) {
      console.error(`[SAFE_LOGGER] Failed to log to Discord: ${err.message}`);
      console.error(message);
    }
  } else {
    console.error(message);
  }
}
const miniGamesCooldown = require("./miniGamesCooldown");
const miniGames = require("./miniGames");
const { handleAchievementsCommand, getAchievementDefinitions, unlockAchievement, hasAchievement, notifyAchievementUnlock, checkAchievementTriggers, getCounterValue, incrementCounter } = require("./achievements");
const { handleMissionCommand } = require("./dailyMissions");
const dailyMissions = require("./dailyMissions");
const { handleProfileCommand, handleProfileCustomizationCommand, handleProfileCustomizationCategorySelect, handleCustomizationCategorySelect, handleFramePurchaseCustomized, handleFrameSelectCustomized, handleTitleActionSelect, handleProfileFrameShop, handleProfileShopCategorySelect, handleProfileFrameVariantSelect, handleRahmenCustomization, handleTitelCustomization, handleCustomizationTitleCategorySelect, handleCustomizationTitleSubcategorySelect, getRankTitleChoices, handleEmbedColorShop, handleEmbedColorCategorySelect, handleEmbedColorVariantSelect, handleEmbedColorActivationMenu, handleEmbedColorActivateSelect } = require("./profileCards");
const { handleOnlineCommand } = require("./online");
const { handleMcMessage } = require("./mcTracker");
const profileSystem = require("./profileSystem");
const weeklyMissionsModule = require("./weeklyMissions");
const liveEmbeds = require("./liveEmbeds");
const botStatus = require("./botStatus");
const absenceManager = require("./absenceManager");
const { handleFaqCommand, handleFaqCategory, handleFaqQuestion, handleFaqSearch } = require("./faq");
const { handleRankingCommand, handleLevelRankingCommand, handleRankingTypesCommand, handleShowUserLevelButton, handleShowMyXpLevelButton } = require("./communityRanking");
const { handleHelpCommand } = require("./helpCommand");
const { handleShopAddExtended, handleShopRemoveExtended, handleShopRestockExtended } = require("./shopCommands");
const shopExt = require("./shopExtended");
const { handleCloseRequestCommand } = require("./shopExtended");
const shop = require("./shop");
const probezeit = require("./probezeit");
const kartenOrders = require("./kartenOrders");
const builderOrders = require("./builderOrders");
const {
  handleProbezeitCommand,
  handleProbezeitAbbrechenCommand,
  handleProbezeitVerlaengernCommand,
  handleProbezeitListeCommand
} = require("./probezeitCommands");
const zahlenGame = require("./zahlenGame/engine");
const werBinIch = require("./werBinIch");
const {
  handleZahlenConfigCommand,
  handleZahlenRestoreCommand,
  handleZahlenStatusCommand,
  handleZahlenLeaderboardCommand
} = require("./zahlenGame/commands");
const { ROLE_HILFSTELLE_MITARBEITER, ROLE_HILFSTELLE_LEITUNG, getDhbtPlusRole, isDhbtPlusRole, getDhbtPlusRoleIds, isGiftIssuer, getShopPurchaseCommandName, isHelpAdminRole, isShopHelperRole } = require("./roles");
const packageJson = require("../package.json");
const { cleanOldLogs } = require("./logCleaner");
const xpSystem = require("./xpSystem");
const logSystem = require("./logSystem");
const embedEvents = require("./embedEvents");
const ticketSystem = require("./tickets/ticketSystem");
const pollSystem = require("./pollSystem");

// Weekly Mission Channel Configuration
const WEEKLY_MISSION_CHANNELS = {
  main: "1514956230248890459",    // Hauptserver
  test: "1514955877432557598"     // Testserver
};

// ============ USER NAME CACHE ============
const USER_CACHE_FILE = require("path").join(DATA_DIR, "userCache.json");
let _userCache = loadJson(USER_CACHE_FILE, {});
let _userCacheDirty = false;
setInterval(() => {
  if (_userCacheDirty) {
    saveJson(USER_CACHE_FILE, _userCache);
    _userCacheDirty = false;
  }
}, 30_000);

function cacheUser(user) {
  if (!user || !user.id) return;
  const name = user.displayName || user.globalName || user.username || null;
  if (name && _userCache[user.id] !== name) {
    _userCache[user.id] = name;
    _userCacheDirty = true;
  }
}

// ============ BADGE DEFINITIONEN ============
const AVAILABLE_BADGES = [
  { name: "test_badge", value: "test_badge", description: "Test Badge" },
  { name: "supporter", value: "supporter", description: "Supporter Badge" },
  { name: "veteran", value: "veteran", description: "Veteran Badge" },
  { name: "meister", value: "meister", description: "Meister Badge" },
  { name: "experte", value: "experte", description: "Experte Badge" },
  { name: "legend", value: "legend", description: "Legend Badge" },
  { name: "profi", value: "profi", description: "Profi Badge" },
  { name: "moderator", value: "moderator", description: "Moderator Badge" },
  { name: "diamant", value: "diamant", description: "Diamant Badge" },
  { name: "beta_tester", value: "beta_tester", description: "Beta-Tester Badge" },
  { name: "tipplegende", value: "tipplegende", description: "Tipplegende Badge" }
];

const BADGE_ADD_CHOICES = [
  { name: "beta_tester", value: "beta_tester", description: "Beta-Tester Badge" }
];

// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Initialize badges module
try {
  if (badges && typeof badges.init === "function") badges.init(client);
} catch (err) {
  logger.discordError(`[BADGES] Init Fehler: ${err.message}`, client);
}

// Initialize standalone Log-System (ProBot-like moderation logs)
try {
  if (logSystem && typeof logSystem.init === "function") logSystem.init(client);
} catch (err) {
  logger.discordError(`[LOG-SYSTEM] Init Fehler: ${err.message}`, client);
}

// Initialize event manager for embed builder events
try {
  if (embedEvents && typeof embedEvents.init === "function") embedEvents.init(client);
} catch (err) {
  logger.discordError(`[EMBED_EVENTS] Init Fehler: ${err.message}`, client);
}

// Initialize ticket system
try {
  if (ticketSystem && typeof ticketSystem.init === "function") ticketSystem.init(client);
} catch (err) {
  logger.discordError(`[TICKET_SYSTEM] Init Fehler: ${err.message}`, client);
}

// Robustheits-Handler: Verhindern, dass unbehandelte Fehler den Prozess crashen
client.on("error", (err) => {
  safeDiscordError(`[CLIENT] Fehler: ${err.message}`, client);
});

client.on("shardError", (err) => {
  safeDiscordError(`[SHARD] Fehler: ${err.message}`, client);
});

process.on("unhandledRejection", (reason, p) => {
  safeDiscordError(`[PROCESS] Unhandled Rejection: ${reason}`, client);
});

process.on("uncaughtException", (err) => {
  safeDiscordError(`[PROCESS] Uncaught Exception: ${err.message}`, client);
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (newState.member?.user?.bot) return;
    if (newState.guild && !isAllowedGuild(newState.guild.id)) return;

    const userId = newState.userId || newState.id;
    const now = Date.now();
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;
    const leftVoice = oldChannelId && !newChannelId;
    const joinedVoice = !oldChannelId && newChannelId;
    const switchedVoice = oldChannelId && newChannelId && oldChannelId !== newChannelId;

    const newBlacklisted = isVoiceChannelBlacklisted(newState.guild.id, newChannelId);

    const finalizeVoiceSession = async () => {
      const session = voiceTracker.stopVoiceSession(newState.guild.id, userId);
      if (!session) {
        return;
      }

      const startedAt = session.startedAt;
      if (!startedAt) {
        logger.warn(`[VOICE] Keine gestartete Zeit für Session gefunden: ${userId}`);
        return;
      }

      // Prüfe aktuellen Blacklist-Status (Channel könnte nachträglich geblacklistet worden sein)
      const channelBlacklisted = session.channelBlacklisted || economy.isChannelBlacklisted(newState.guild.id, session.channelId);
      if (channelBlacklisted) {
        logger.info(`[VOICE] Session in geblacklistetem Channel ignoriert: ${userId} — ${session.channelId}`);
        return;
      }

      const minutes = Math.max(0, Math.floor((now - startedAt) / 60000));
      if (minutes <= 0) {
        logger.info(`[VOICE] Session zu kurz (${minutes}min), nicht gezählt: ${userId}`);
        return;
      }

      logger.info(`[VOICE] Session finalisiert: ${userId} — ${minutes} Minuten`);

      const totalVoice = incrementCounter(newState.guild.id, userId, "voice", minutes);
      checkAchievementTriggers(newState.guild.id, userId, "voice", totalVoice, client);

      // Bereits live vergabene Minuten abziehen (Live-Coins wurden jede Minute gutgeschrieben)
      // Nur die restliche Sekunden-Fraktion (< 1 Minute) nachvergeben
      const liveMinutesAlreadyPaid = voiceTracker.getSessionVoiceCoins(newState.guild.id, userId) > 0
        ? Math.floor(voiceTracker.getSessionVoiceCoins(newState.guild.id, userId) / Math.max(0.001, xp?.getXpConfig?.()?.voiceRewardPerMinute || 0.5))
        : 0;
      const remainingMinutes = Math.max(0, minutes - liveMinutesAlreadyPaid);

      // Award restliche Coins (Sekunden-Rest) — Live hat ganzen Minuten schon abgedeckt
      try {
        const username = newState.member?.user?.username || newState.member?.user?.tag || userId;
        if (xp && typeof xp.awardVoicePoints === "function" && remainingMinutes > 0) {
          xp.awardVoicePoints(newState.guild.id, userId, username, remainingMinutes, client, session.channelId || null);
          logger.info(`[VOICE] Voice-Coins (Rest) vergeben: ${username} +${remainingMinutes} Minuten`);
        }
      } catch (err) {
        logger.error(`[VOICE] Fehler beim Ausgeben von Voice-Coins: ${err.message}`);
      }
      // Weekly Voice-Missionen werden jetzt live pro Minute gezählt (siehe xp.liveAwardAllVoiceUsers)
      // Daily missions: Voice-Minuten werden jetzt auch live gezählt — beim Leave nur Completion prüfen
      try {
        const mission = dailyMissions.getTodayMission(newState.guild.id, userId);
        if (mission && mission.id.startsWith("voice_")) {
          // Live-Tracking hat schon alle ganzen Minuten gezählt, keine Doppelzählung
          const completion = dailyMissions.checkMissionCompletion(newState.guild.id, userId, newState.member, client);
          if (completion.completed) {
            checkMissionAchievements(userId, newState.member?.user);
          }
        }
      } catch (e) {}
    };

    const startVoiceSession = () => {
      voiceTracker.startVoiceSession(newState.guild.id, userId, newChannelId, newBlacklisted);
    };

    if (joinedVoice) {
      if (newBlacklisted) {
        voiceTracker.stopVoiceSession(newState.guild.id, userId);
        return;
      }
      startVoiceSession();

      // Daily missions: track call join (daily_1_call)
      try {
        const mission = dailyMissions.getTodayMission(newState.guild.id, userId);
        if (mission && mission.id === "daily_1_call") {
          dailyMissions.incrementProgress(newState.guild.id, userId, mission.id, 1);
          const completion = dailyMissions.checkMissionCompletion(newState.guild.id, userId, newState.member, client);
          if (completion.completed) {
            checkMissionAchievements(userId, newState.member?.user);
          }
        }
      } catch (e) {}

      // Weekly missions: track voice joins
      try {
        const weekly = require("./weeklyMissions");
        if (weekly.isWeeklyActive(newState.guild.id)) {
          const campaign = weekly.getActiveCampaign(newState.guild.id);
          if (campaign && Array.isArray(campaign.missions)) {
            const joinMissions = campaign.missions.filter(m => m.id.startsWith("weekly_joins"));
            for (const wm of joinMissions) {
              weekly.incrementProgress(newState.guild.id, userId, wm.id, 1, client);
            }
          }
        }
      } catch (e) {}
      
      return;
    }

    if (leftVoice) {
      await finalizeVoiceSession();
      return;
    }

    if (switchedVoice) {
      await finalizeVoiceSession();
      if (newBlacklisted) {
        voiceTracker.stopVoiceSession(newState.guild.id, userId);
        return;
      }
      startVoiceSession();
      return;
    }
  } catch (err) {
    safeDiscordError(`[VOICE] Fehler beim Tracken von Voice-Zeit: ${err.message}`, client);
  }
});

function checkActiveVoiceAchievements(client) {
  try {
    const userIds = voiceTracker.getActiveVoiceUsers(Haupt_GUILD);
    if (!userIds.length) return;

    for (const userId of userIds) {
      const sessionMinutes = voiceTracker.getActiveVoiceMinutes(Haupt_GUILD, userId);
      if (sessionMinutes <= 0) continue;

      const currentVoiceCount = getCounterValue(Haupt_GUILD, userId, "voice");
      const totalVoice = currentVoiceCount + sessionMinutes;
      checkAchievementTriggers(Haupt_GUILD, userId, "voice", totalVoice, client);
    }
  } catch (err) {
    safeDiscordError(`[VOICE] Fehler beim Überprüfen aktiver Voice-Erfolge: ${err.message}`, client);
  }
}

// Speichert wer bereits live benachrichtigt wurde (um Doppel-DMs zu vermeiden)
const liveVoiceNotified = new Set();

// Live-Tracking für Voice-Zeit Missionen (alle 5 Minuten)
// Zeigt Fortschritt an und sendet DM bei Erreichung, persistiert aber erst beim Verlassen
function trackLiveVoiceMissions(client) {
  try {
    const userIds = voiceTracker.getActiveVoiceUsers(Haupt_GUILD);
    if (!userIds.length) return;

    for (const userId of userIds) {
      const session = voiceTracker.getVoiceSession(Haupt_GUILD, userId);
      if (!session || session.channelBlacklisted) continue;

      const minutes = voiceTracker.getActiveVoiceMinutes(Haupt_GUILD, userId);
      if (minutes <= 0) continue;

      // Daily missions: prüfe Voice-Zeit live
      try {
        const mission = dailyMissions.getTodayMission(Haupt_GUILD, userId);
        if (mission && mission.id.startsWith("voice_")) {
          const currentProgress = dailyMissions.getProgress(Haupt_GUILD, userId, mission.id) || 0;
          const target = mission.target || 15;
          const totalProgress = currentProgress + minutes;
          
          // Prüfe ob Mission gerade jetzt abgeschlossen wurde (live)
          if (totalProgress >= target && currentProgress < target) {
            const notifyKey = `${userId}_${mission.id}_${new Date().toDateString()}`;
            if (!liveVoiceNotified.has(notifyKey)) {
              liveVoiceNotified.add(notifyKey);
              
              // Sende DM bei Abschluss (echte Persistierung erfolgt beim Verlassen)
              try {
                const user = client.users.cache.get(userId);
                if (user) {
                  const { EmbedBuilder } = require("discord.js");
                  const liveEmbed = new EmbedBuilder()
                    .setColor(0x00C851)
                    .setTitle("✅ Mission abgeschlossen!")
                    .addFields(
                      { name: "🎯 Mission", value: `**${mission.name || "Voice Zeit"}**`, inline: false },
                      { name: "<:DHBT_COIN:1512242287411990588> Belohnung", value: `**${mission.reward || mission.max || 50} DHBT-Coins**`, inline: true }
                    )
                    .setFooter({ text: "Weiter so! Komm morgen wieder für eine neue Mission." })
                    .setTimestamp();
                  user.send({ embeds: [liveEmbed] }).catch(() => {});
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }
    
    // Bereinige alte Einträge (älter als 24h)
    const today = new Date().toDateString();
    for (const key of liveVoiceNotified) {
      if (!key.includes(today)) {
        liveVoiceNotified.delete(key);
      }
    }
  } catch (err) {
    safeDiscordError(`[VOICE] Fehler beim Live-Tracken von Voice-Missionen: ${err.message}`, client);
  }
}


// ======================
// COMMANDS
// ======================
const commands = [
  shardMerchant.slashCommand,
  { name: "settings", description: "⚙️ Auktionshaus-Benachrichtigungen verwalten" },
  {
    name: "spiel",
    description: "Ein neues Spiel erstellen",
    options: [
      { name: "id", type: 4, description: "Spiel-ID", required: true },
      { name: "name", type: 3, description: "Begegnung (z.B. DE vs FR)", required: true },
      { name: "tipp_sperren", type: 3, description: "Tipp-Sperre ab Berlin MESZ (z.B. 09.06.2026 21:00)", required: false }
    ]
  },
  {
    name: "spiel-loeschen",
    description: "Ein Spiel löschen",
    options: [
      { name: "spielid", type: 4, description: "ID des Spiels", required: true }
    ]
  },
  
  {
    name: "tipp-config",
    description: "Konfiguriere den Tipp-Kanal",
    options: [
      {
        name: "action",
        type: 3,
        description: "set oder show",
        required: true,
        choices: [
          { name: "set", value: "set" },
          { name: "show", value: "show" }
        ]
      },
      {
        name: "server",
        type: 3,
        description: "main oder test",
        required: false,
        choices: [
          { name: "main", value: "main" },
          { name: "test", value: "test" }
        ]
      },
      { name: "channel", type: 7, description: "Channel auswählen", required: false }
    ]
  },
  {
    name: "event",
    description: "Verwaltet Events",
    options: [
      {
        name: "start",
        type: 1,
        description: "Starte ein Event",
        options: [
          { name: "id", type: 3, description: "Event-ID", required: true },
          { name: "name", type: 3, description: "Event-Name", required: true },
          { name: "rate", type: 4, description: "Exchange Rate (Event Coins pro DHBT-Coin)", required: false }
        ]
      },
      {
        name: "end",
        type: 1,
        description: "Beende ein Event",
        options: [
          { name: "id", type: 3, description: "Event-ID", required: true }
        ]
      },
      {
        name: "show",
        type: 1,
        description: "Zeigt die Bestenliste eines Events",
        options: [
          { name: "id", type: 3, description: "Event-ID (optional)", required: false }
        ]
      },
      {
        name: "add",
        type: 1,
        description: "Vergibt Event-Coins",
        options: [
          { name: "eventid", type: 3, description: "Event-ID", required: true },
          { name: "user", type: 6, description: "User", required: true },
          { name: "amount", type: 4, description: "Event-Coins", required: true },
          { name: "reason", type: 3, description: "Grund (optional)", required: false }
        ]
      }
    ]
  },
  {
    name: "convert-event",
    description: "Konvertiert ein Event in DHBT-Coins",
    options: [
      { name: "eventid", type: 3, description: "Event-ID", required: true }
    ]
  },
  {
    name: "convert-all-events",
    description: "Konvertiert alle aktiven Events"
  },
  {
    name: "online",
    description: "Zeigt deine Online-/Activity-Statistiken",
    options: [
      { name: "user", type: 6, description: "Optionaler Nutzer", required: false }
    ]
  },
  {
    name: "mc-register",
    description: "Verknüpfe deinen Minecraft-Account mit deinem Discord-Account",
    options: [
      { name: "uuid", type: 3, description: "Deine Minecraft-UUID (Java: namemc.com | Bedrock: Floodgate-UUID)", required: true },
      { name: "name", type: 3, description: "Nur für Bedrock-Spieler: Dein Gamertag inklusive Punkt (.)", required: false }
    ]
  },
  {
    name: "passwort-vergessen",
    description: "Erhalte ein neues einmaliges Passwort für das DHBT User-Interface per DM"
  },
  {
    name: "faq",
    description: "Häufig gestellte Fragen (FAQ)",
    options: [
      { 
        name: "search", 
        type: 3, 
        description: "Suche nach einem Schlagwort (optional)", 
        required: false 
      }
    ]
  },
  {
    name: "weekly-mission",
    description: "Zeigt die aktuellen Weekly-Missionen und erlaubt Teilnahme",
  },
  {
    name: "prestige",
    description: "Steige in den nächsten Prestige auf (nur bei Level 100 möglich)",
    options: [
      { name: "confirm", type: 5, description: "Bestätige den Prestige-Aufstieg (Level wird auf 1 zurückgesetzt)", required: false }
    ]
  },
  {
    name: "probezeit",
    description: "Starte eine Probezeit für einen User (Clan-Team only)",
    options: [
      { name: "user", type: 6, description: "User, der in Probezeit soll", required: true },
      { name: "minecraft_name", type: 3, description: "Minecraft Ingame-Name (Java oder Bedrock mit führendem Punkt)", required: true },
      { name: "dauer", type: 3, description: "Dauer z.B. 7d, 12h, 30m", required: true },
      { name: "zielrolle", type: 8, description: "Rolle nach erfolgreicher Probezeit", required: true }
    ]
  },
  {
    name: "probezeit-abbrechen",
    description: "Breche eine aktive Probezeit ab (Clan-Team only)",
    options: [
      { name: "user", type: 6, description: "User, dessen Probezeit abgebrochen werden soll", required: true }
    ]
  },
  {
    name: "probezeit-verlaengern",
    description: "Verlängere eine aktive Probezeit (Clan-Team only)",
    options: [
      { name: "user", type: 6, description: "User, dessen Probezeit verlängert werden soll", required: true },
      { name: "dauer", type: 3, description: "Zusätzliche Dauer z.B. 3d, 6h, 30m", required: true }
    ]
  },
  {
    name: "probezeit-liste",
    description: "Zeigt alle aktiven Probezeiten (Clan-Team only)"
  },
  {
    name: "zahlen",
    description: "Zahlen-Minigame verwalten",
    options: [
      {
        name: "konfigurieren",
        description: "Setzt den Channel für das Zahlen-Minigame",
        type: 1,
        options: [
          { name: "channel", type: 7, description: "Channel für das Spiel", required: true }
        ]
      },
      {
        name: "restore",
        description: "Stellt die letzte verlorene Runde wieder her",
        type: 1
      },
      {
        name: "status",
        description: "Zeigt den aktuellen Status des Zahlen-Minigames",
        type: 1
      },
      {
        name: "leaderboard",
        description: "Zeigt die Rangliste",
        type: 1,
        options: [
          {
            name: "typ",
            type: 3,
            description: "Art der Rangliste",
            required: false,
            choices: [
              { name: "Korrekte Zahlen", value: "correct" },
              { name: "Fehler", value: "errors" },
              { name: "Teilnahmen", value: "participations" },
              { name: "Coins", value: "coins" }
            ]
          }
        ]
      }
    ]
  },
  {
    name: "addcoins",
    description: "Füge einem Nutzer DHBT-Coins hinzu",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "amount", type: 4, description: "Coins", required: true }
    ]
  },
  {
    name: "reward-config",
    description: "Konfiguriere Chat- und Voice-Coin- & Level-XP-Rewards (Admin)",
    options: [
      {
        name: "show",
        type: 1,
        description: "Zeige aktuelle Reward-Einstellungen"
      },
      {
        name: "chat-set",
        type: 1,
        description: "Chat-Reward anpassen",
        options: [
          { name: "coins", type: 10, description: "Coins pro Schwelle (z.B. 1.5)", required: false },
          { name: "xp", type: 10, description: "Level-XP pro Schwelle (z.B. 5)", required: false },
          { name: "threshold", type: 4, description: "Nachrichten bis Reward (z.B. 10)", required: false },
          { name: "max_per_minute", type: 10, description: "Max Coins pro Minute (Anti-Spam)", required: false },
          { name: "channel", type: 7, description: "Nur in diesem Channel zählen (optional)", required: false },
          { name: "time_from", type: 3, description: "Von Uhrzeit HH:MM (optional)", required: false },
          { name: "time_to", type: 3, description: "Bis Uhrzeit HH:MM (optional)", required: false },
          { name: "enabled", type: 5, description: "Chat-Reward (Coins + XP) aktivieren/deaktivieren", required: false }
        ]
      },
      {
        name: "voice-set",
        type: 1,
        description: "Voice-Reward anpassen",
        options: [
          { name: "rate", type: 10, description: "Coins pro Minute (z.B. 0.5)", required: false },
          { name: "xp_rate", type: 10, description: "Level-XP pro Minute (z.B. 2)", required: false },
          { name: "max_session", type: 10, description: "Max Coins pro Session", required: false },
          { name: "channel", type: 7, description: "Nur in diesem Voice-Channel zählen (optional)", required: false },
          { name: "time_from", type: 3, description: "Von Uhrzeit HH:MM (optional)", required: false },
          { name: "time_to", type: 3, description: "Bis Uhrzeit HH:MM (optional)", required: false },
          { name: "enabled", type: 5, description: "Voice-Reward (Coins + XP) aktivieren/deaktivieren", required: false }
        ]
      },
      {
        name: "reset-channels",
        type: 1,
        description: "Channel- und Zeitfenster-Filter zurücksetzen",
        options: [
          { name: "type", type: 3, description: "Welcher Typ?", required: true, choices: [
            { name: "Chat", value: "chat" },
            { name: "Voice", value: "voice" },
            { name: "Beide", value: "both" }
          ]}
        ]
      }
    ]
  },
  {
    name: "removecoins",
    description: "Entferne DHBT-Coins von einem Nutzer",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "amount", type: 4, description: "Coins", required: true }
    ]
  },
  {
    name: "setcoins",
    description: "Setze das DHBT-Coin Guthaben eines Nutzers",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "amount", type: 4, description: "Coins", required: true }
    ]
  },
  {
    name: "coins",
    description: "Zeigt deinen DHBT-Coin Kontostand (Admins können optional einen anderen Nutzer abfragen)",
    options: [
      { name: "user", type: 6, description: "Zeige den Kontostand eines anderen Nutzers", required: false }
    ]
  },
  {
    name: "pay",
    description: "Überweise DHBT-Coins an einen anderen Spieler (nur DHBT+)",
    options: [
      {
        name: "send",
        type: 1,
        description: "Sende DHBT-Coins an einen Nutzer",
        options: [
          { name: "user", type: 6, description: "Empfänger der Coins", required: true },
          { name: "amount", type: 4, description: "Anzahl der DHBT-Coins", required: true },
          { name: "reason", type: 3, description: "Optionaler Grund für die Überweisung", required: false }
        ]
      },
      {
        name: "history",
        type: 1,
        description: "Zeigt die letzten Überweisungen",
        options: [
          { name: "user", type: 6, description: "Zeigt die Historie eines anderen Nutzers (Admins)", required: false }
        ]
      }
    ]
  },
  { name: "help", description: "Zeige alle verfügbaren Befehle" },
  {
    name: "gift",
    description: "Vergibt für eine begrenzte Zeit die DHBT+ Rolle",
    options: [
      { name: "user", type: 6, description: "User, dem die Rolle gegeben werden soll", required: true },
      { name: "hours", type: 4, description: "Dauer in Stunden (1-720). Standard: 24", required: false },
      { name: "days", type: 4, description: "Dauer in Tagen (1-30). Alternative zu Stunden", required: false }
    ]
  },
  {
    name: "gift-dhbt-plus",
    description: "Vergibt DHBT+ für 7 Tage an einen User; nur DHBT+ Mitglieder können diesen Befehl nutzen.",
    options: [
      { name: "user", type: 6, description: "User, der die Rolle erhalten soll", required: true }
    ]
  },
  {
    name: "user",
    description: "Vergibt Rollen an Nutzer mit begrenzter Dauer",
    options: [
      {
        name: "give",
        type: 1,
        description: "Vergib eine Rolle an einen Nutzer für eine bestimmte Dauer",
        options: [
          { name: "user", type: 6, description: "User, dem die Rolle gegeben werden soll", required: true },
          { name: "role", type: 8, description: "Rolle", required: true },
          { name: "duration", type: 4, description: "Dauer in Stunden", required: true },
          { name: "reason", type: 3, description: "Grund für die Vergabe", required: false }
        ]
      }
    ]
  },
  {
    name: "channel-blacklist",
    description: "Verwalte kanalspezifische Coin-Blacklist",
    options: [
      {
        name: "action",
        type: 3,
        description: "add, remove oder list",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" }
        ]
      },
      { name: "channel", type: 7, description: "Channel auswählen", required: false }
    ]
  },
  {
    name: "leaderboard-blacklist",
    description: "Verwalte User auf der Leaderboard-Blacklist",
    options: [
      {
        name: "action",
        type: 3,
        description: "add, remove oder list",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" }
        ]
      },
      { name: "user", type: 6, description: "User auswählen", required: false }
    ]
  },
  {
    name: "leaderboard-config",
    description: "Konfiguriere Leaderboard-Live-Update-Kanäle",
    options: [
      {
        name: "action",
        type: 3,
        description: "set oder show",
        required: true,
        choices: [
          { name: "set", value: "set" },
          { name: "show", value: "show" }
        ]
      },
      {
        name: "type",
        type: 3,
        description: "dhbt oder event",
        required: false,
        choices: [
          { name: "DHBT-Coins", value: "dhbt" },
          { name: "Event-Bestenliste", value: "event" }
        ]
      },
      {
        name: "server",
        type: 3,
        description: "main oder test",
        required: false,
        choices: [
          { name: "main", value: "main" },
          { name: "test", value: "test" }
        ]
      },
      { name: "channel", type: 7, description: "Channel auswählen", required: false }
    ]
  },
  {
    name: "command",
    description: "Verwalte den Status von Slash-Commands",
    options: [
      {
        name: "disable",
        type: 1,
        description: "Aktiviere oder deaktiviere einen Befehl",
        options: [
          { name: "command", type: 3, description: "Name des Befehls", required: true, autocomplete: true },
          { name: "active", type: 5, description: "Aktivieren (true) oder deaktivieren (false)", required: true },
          { name: "reason", type: 3, description: "Grund für die Änderung", required: true }
        ]
      }
    ]
  },
  {
    name: "shop-config",
    description: "Konfiguriere den Live-Shop-Kanal",
    options: [
      {
        name: "action",
        type: 3,
        description: "set oder show",
        required: true,
        choices: [
          { name: "set", value: "set" },
          { name: "show", value: "show" }
        ]
      },
      {
        name: "server",
        type: 3,
        description: "main oder test",
        required: false,
        choices: [
          { name: "main", value: "main" },
          { name: "test", value: "test" }
        ]
      },
      { name: "channel", type: 7, description: "Channel auswählen", required: false }
    ]
  },
  {
    name: "shop-add",
    description: "Fügt ein Item zum Shop hinzu mit Kategorie, Sichtbarkeit, Lagerbestand und Limit pro Person",
    options: [
      { name: "id", type: 3, description: "Item ID", required: true },
      { name: "name", type: 3, description: "Name", required: true },
      { name: "price", type: 4, description: "Preis (DHBT-Coins)", required: true },
      { name: "category", type: 3, description: "Kategorie", required: true },
      { name: "description", type: 3, description: "Beschreibung", required: false },
      { name: "visibility", type: 3, description: "Sichtbarkeit (public/clan/both)", required: false, choices: [
        { name: "Public", value: "public" },
        { name: "Clan", value: "clan" },
        { name: "Beide", value: "both" }
      ]},
      { name: "type", type: 3, description: "Item-Typ", required: false },
      { name: "stock", type: 4, description: "Lagerbestand (max. verfügbare Menge)", required: false },
      { name: "limit", type: 4, description: "Limit pro Person", required: false },
      { name: "active", type: 5, description: "Aktiv?", required: false },
      { name: "openthread", type: 5, description: "Privaten Thread bei Kauf erstellen?", required: false },
      { name: "rolename", type: 8, description: "Rolle auswählen (für Discord Role Items)", required: false },
      { name: "duration", type: 3, description: "Dauer: 1h/1d/1w/1M (optional, nur für Rollen). h=1-23, d=1-6, w=1-3, M=1-12", required: false }
    ]
  },
  {
    name: "restock",
    description: "Aktualisiere Lagerbestand oder Preis für ein Shop-Item",
    options: [
      { name: "id", type: 3, description: "Item ID", required: true },
      { name: "amount", type: 4, description: "Neuer Lagerbestand", required: true },
      { name: "price", type: 4, description: "Neuer Preis (optional)", required: false }
    ]
  },
  {
    name: "shop-remove",
    description: "Entfernt ein Item aus dem Public- oder Clan-Shop",
    options: [
      { name: "itemid", type: 3, description: "Item ID", required: true },
      { name: "visibility", type: 3, description: "Shop wählen", required: false, choices: [
        { name: "Public", value: "public" },
        { name: "Clan", value: "clan" }
      ] }
    ]
  },
  { name: "reload-config", description: "Lädt die Bot-Konfiguration neu" },
  {
    name: "reset-all",
    description: "Setzt Daten von Modulen zurück",
    options: [
      {
        name: "confirm",
        type: 5,
        description: "Bestätige den Reset mit true",
        required: true
      },
      {
        name: "module",
        type: 3,
        description: "Welches Modul soll zurückgesetzt werden?",
        required: false,
        choices: [
          { name: "Alle Module", value: "all" },
          { name: "Games", value: "games" },
          { name: "Economy", value: "economy" },
          { name: "Daily Rewards", value: "daily" },
          { name: "Daily Missions", value: "missions" },
          { name: "Weekly Missions", value: "weekly" },
          { name: "Clan Shop", value: "shop" },
          { name: "Public Shop", value: "public-shop" },
          { name: "Achievements", value: "achievements" },
          { name: "Events", value: "events" },
          { name: "Mini Games", value: "minigames" },
          { name: "Gift Restriktionen", value: "gift" },
          { name: "Zahlen-Minigame", value: "zahlen-minigame" }
        ]
      }
    ]
  },
  {
    name: "ergebnis",
    description: "Ergebnis setzen",
    options: [
      { name: "spielid", type: 4, description: "Spiel-ID", required: true },
      { name: "resultat", type: 3, description: "Ergebnis (z.B. 2:1)", required: true }
    ]
  },
  { name: "spiele", description: "Zeigt alle Spiele" },
  {
    name: "tipps",
    description: "Zeigt alle Tipps",
    options: [
      { name: "spielid", type: 4, description: "Optional: Spiel-ID", required: false }
    ]
  },
  {
    name: "tipp-setzen",
    description: "Owner: Setze oder aktiviere einen Tipp für einen Nutzer",
    options: [
      { name: "user", type: 6, description: "Nutzer, für den der Tipp gesetzt werden soll", required: true },
      { name: "spielid", type: 4, description: "Spiel-ID", required: true },
      { name: "tipp", type: 3, description: "Tipp im Format z.B. 2:1", required: true },
      { name: "winner", type: 3, description: "Gewinner: 1 / X / 2", required: true, choices: [
        { name: "1", value: "1" },
        { name: "X", value: "X" },
        { name: "2", value: "2" }
      ] }
    ]
  },
  {
    name: "title",
    description: "Verwalte deinen Rang-Titel (Alias)",
    options: [
      {
        name: "show",
        type: 1,
        description: "Zeige deinen aktuellen Rang-Titel"
      },
      {
        name: "set",
        type: 1,
        description: "Wähle einen Titel aus",
        options: [
          { name: "title", type: 3, description: "Titel (optional, alternativ Dropdown nutzen)", required: false }
        ]
      },
      {
        name: "toggle",
        type: 1,
        description: "Aktiviere oder deaktiviere die Rang-Titel-Anzeige",
        options: [
          { name: "enabled", type: 5, description: "Aktivieren oder deaktivieren", required: true }
        ]
      },
      {
        name: "clear",
        type: 1,
        description: "Setze die manuelle Rang-Titel-Auswahl zurück"
      }
    ]
  },
  { name: "ranking", description: "Live Ranking aktualisieren" },
  {
    name: "badge-add",
    description: "Vergebe ein Badge an einen User (Admin)",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "badge", type: 3, description: "Badge-ID", required: true, choices: BADGE_ADD_CHOICES }
    ]
  },
  {
    name: "badge-remove",
    description: "Entferne ein Badge von einem User (Admin)",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "badge", type: 3, description: "Badge-ID", required: true, choices: AVAILABLE_BADGES }
    ]
  },

  // ============ ADMIN TOOLS ============
  {
    name: "admin",
    description: "Admin Tools (Clan Team nur)",
    options: [
      {
        name: "reset-mission",
        type: 1,
        description: "Weise einem User eine neue tägliche Mission zu",
        options: [
          { name: "user", type: 6, description: "User", required: true }
        ]
      },
      {
        name: "set-payouts",
        type: 1,
        description: "Ändere Min/Max Payout für Spiele",
        options: [
          { name: "min", type: 4, description: "Minimum Coins", required: true },
          { name: "max", type: 4, description: "Maximum Coins", required: true }
        ]
      }
      ,
      {
        name: "set-daily-range",
        type: 1,
        description: "Setze Min/Max für Daily-Reward",
        options: [
          { name: "min", type: 4, description: "Minimum Coins", required: true },
          { name: "max", type: 4, description: "Maximum Coins", required: true }
        ]
      },
      {
        name: "send-dm",
        type: 1,
        description: "Sende jedem Mitglied des Servers eine Direktnachricht",
        options: [
          { name: "message", type: 3, description: "Die Nachricht, die gesendet werden soll", required: true },
          { name: "role", type: 8, description: "Optional: Nur Mitglieder mit dieser Rolle erhalten die DM", required: false }
        ]
      }
    ]
  },
  // ============ NEUE MODULE ============
  // Daily Rewards
  { name: "daily", description: "Claime deine tägliche Belohnung (25-150 Coins)" },
  { name: "mission", description: "Zeigt deine heutige tägliche Mission" },

  // Achievements
  {
    name: "achievements",
    description: "Zeige deine Achievements",
    options: [
      { name: "user", type: 6, description: "Optional: Zeige die Erfolge eines anderen Users (Admin)", required: false }
    ]
  },
  {
    name: "erfolge",
    description: "Zeige deine Erfolge",
    options: [
      { name: "user", type: 6, description: "Optional: Zeige die Erfolge eines anderen Users (Admin)", required: false }
    ]
  },

  // Mini-Games
  {
    name: "minigames",
    description: "Spiele Mini-Games (SSP, Duell, TicTacToe, Slots, Würfeln)",
    options: [
      {
        name: "game",
        type: 3,
        description: "Wähle ein Minigame",
        required: true,
        choices: [
          { name: "SSP (Schere-Stein-Papier)", value: "ssp" },
          { name: "Duell (Zahlen 1-100)", value: "duell" },
          { name: "TicTacToe", value: "tictactoe" },
          { name: "🎰 Slots (nur vs Bot)", value: "slots" },
          { name: "🎲 Würfeln (nur vs Bot)", value: "wuerfeln" },
          { name: "🧠 Wer bin ich? (nur PvP)", value: "wer_bin_ich" }
        ]
      },
      {
        name: "bet",
        type: 4,
        description: "Setze X Coins (1-300)",
        required: true
      },
      {
        name: "user",
        type: 6,
        description: "Optional: Wähle einen Gegner (PvP)",
        required: false
      }
    ]
  },

  // Profile Cards
  {
    name: "profil",
    description: "Zeigt dein oder das Profil eines anderen Users",
    options: [
      { name: "user", type: 6, description: "Optionaler User", required: false }
    ]
  },
  {
    name: "profilanpassungen",
    description: "Passe dein Profil an (Badges, Titel, Rahmen, Shop)"
  },
  { name: "badges-remove", description: "Entferne ein Badge (nur manuell verliehene)", options: [ { name: "badge", type: 3, description: "Badge-ID (z.B. test_badge)", required: true } ] },
  { name: "closerequest", description: "Schließe das aktuelle Shop-Ticket oder Karten-Bestellung" },

  // Community Ranking
  { name: "ranking-coins", description: "Zeigt das Coin-Ranking" },
  { name: "ranking-level", description: "Zeigt das Level-Ranking" },
  {
    name: "ranking-type",
    description: "Zeigt Ranking nach Typ",
    options: [
      {
        name: "type",
        type: 3,
        description: "Ranking-Typ",
        required: false,
        choices: [
          { name: "<:DHBT_COIN:1512242287411990588> Coins", value: "coins" },
          { name: "📊 Level", value: "level" }
        ]
      }
    ]
  },
  {
    name: "bauauftrag",
    description: "Veröffentliche einen neuen Builder-Auftrag"
  },
  {
    name: "melden",
    description: "Erstelle eine Bug- oder Feature-Meldung",
    options: [
      { name: "typ", type: 3, description: "Bug oder Feature", required: true, choices: [{ name: "Bug", value: "bug" }, { name: "Feature", value: "feature" }] },
      { name: "titel", type: 3, description: "Titel", required: true },
      { name: "kurzzusammenfassung", type: 3, description: "Kurze Zusammenfassung", required: true },
      { name: "beschreibung", type: 3, description: "Beschreibung", required: true },
      { name: "priorität", type: 3, description: "Priorität", required: true, choices: [{ name: "Niedrig", value: "low" }, { name: "Mittel", value: "medium" }, { name: "Hoch", value: "high" }] },
      { name: "bild_url", type: 3, description: "Optional: Bild-URL", required: false }
    ]
  }
];

function getAvailableCommandNames() {
  return commands
    .map(cmd => cmd.name)
    .filter(name => name && name !== "command")
    .sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));
}

function getCommandAutocompleteOptions(focusedValue) {
  const lowerFocus = (focusedValue || "").toLowerCase();
  return getAvailableCommandNames()
    .filter(name => name.toLowerCase().includes(lowerFocus))
    .slice(0, 25)
    .map(name => ({ name, value: name }));
}

const GIFT_RESTRICTIONS_FILE = path.join(DATA_DIR, "giftRestrictions.json");
const giftData = loadJson(GIFT_RESTRICTIONS_FILE, {
  cooldowns: {},
  monthlyBlocks: {},
  activeAssignments: {}
});

function saveGiftData() {
  saveJson(GIFT_RESTRICTIONS_FILE, giftData);
}

function getMonthEndTimestamp(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  return nextMonth.getTime();
}

async function removeGiftRole(guild, memberId) {
  try {
    const member = await guild.members.fetch(memberId).catch(() => null);
    if (!member) return;
    if (isDhbtPlusRole(member)) {
      const dhbtRole = getDhbtPlusRole(guild);
      if (dhbtRole) await member.roles.remove(dhbtRole, "DHBT+ Timer abgelaufen").catch(() => {});
    }
  } catch (error) {
    logger.discordError(`[GIFTS] Fehler beim Entfernen der DHBT+ Rolle: ${error.message}`, client);
  }

  if (giftData.activeAssignments[memberId]) {
    delete giftData.activeAssignments[memberId];
    saveGiftData();
  }
}



// ======================
// ACHIEVEMENT TRIGGER SYSTEM
// Delegated to `modules/achievements.js` - import `checkAchievementTriggers` there.
// ======================

/**
 * Wird regelmäßig aufgerufen um Coin-Achievements zu checken
 * @param {string} userId
 * @param {number} coins
 * @param {User} user
 */
async function checkCoinAchievements(userId, coins, user) {
  await checkAchievementTriggers(Haupt_GUILD, userId, 'coins', coins, client);
}

async function checkMissionAchievements(userId, user) {
  if (!userId || !user) return;
  try {
    const stats = dailyMissions.getUserMissionStats(Haupt_GUILD, userId);
    await checkAchievementTriggers(Haupt_GUILD, userId, 'missions_total', stats.completedTotal, client);
    await checkAchievementTriggers(Haupt_GUILD, userId, 'streak', stats.streak, client);

    for (const [category, count] of Object.entries(stats.completedByCategory || {})) {
      await checkAchievementTriggers(Haupt_GUILD, userId, 'missions_category', count, client, { category });
    }
  } catch (err) {
    logger.discordError(`[ACHIEVEMENTS] Fehler beim Prüfen der Missions-Erfolge: ${err.message}`, client);
  }
}

async function handleGiftCommand(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: "❌ Dieser Befehl kann nur auf einem Server benutzt werden.", flags: 64 });
  }

  if (isDhbtPlusRole(interaction.member) && !isGiftIssuer(interaction.member)) {
    return interaction.reply({ content: "❌ Du kannst diesen Befehl nicht benutzen, solange du die DHBT+ Rolle hast.", flags: 64 });
  }

  if (!isGiftIssuer(interaction.member)) {
    return interaction.reply({ content: "❌ Du hast keine Berechtigung für diesen Befehl.", flags: 64 });
  }

  const targetUser = interaction.options.getUser("user");
  const hours = interaction.options.getInteger("hours");
  const days = interaction.options.getInteger("days");

  if (hours != null && days != null) {
    return interaction.reply({ content: "❌ Bitte gib entweder Stunden oder Tage an, nicht beides.", flags: 64 });
  }

  let durationHours = 24;
  let durationLabel = "Stunden";

  if (days != null) {
    if (days < 1 || days > 30) {
      return interaction.reply({ content: "❌ Die Dauer muss zwischen 1 und 30 Tagen liegen.", flags: 64 });
    }
    durationHours = days * 24;
    durationLabel = days === 1 ? "Tag" : "Tage";
  } else if (hours != null) {
    if (hours < 1 || hours > 720) {
      return interaction.reply({ content: "❌ Die Dauer muss zwischen 1 und 720 Stunden liegen.", flags: 64 });
    }
    durationHours = hours;
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: "❌ Der angegebene User konnte nicht gefunden werden.", flags: 64 });
  }

  const role = getDhbtPlusRole(interaction.guild);
  if (!role) {
    return interaction.reply({ content: "❌ Die DHBT+ Rolle ist auf diesem Server nicht vorhanden.", flags: 64 });
  }

  if (isDhbtPlusRole(targetMember)) {
    return interaction.reply({ content: `⚠️ **${targetMember.user.tag}** hat bereits die DHBT+ Rolle.`, flags: 64 });
  }

  try {
    await targetMember.roles.add(role, `DHBT+ Geschenk durch ${interaction.user.tag} für ${durationHours} Stunden`);
    await badges.syncBadgesForMember(interaction.guildId, targetMember, false);
  } catch (error) {
    logger.discordError(`[GIFTS] Fehler beim Hinzufügen der Rolle: ${error.message}`, client);
    return interaction.reply({ content: "❌ Ich konnte die Rolle nicht vergeben. Bitte prüfe meine Berechtigungen.", flags: 64 });
  }

  if (giftTimers.has(targetMember.id)) {
    clearTimeout(giftTimers.get(targetMember.id));
  }

  const durationMs = durationHours * 60 * 60 * 1000;
  const { startTimer } = require("./timerService");

  // persistenter Timer für das Entfernen der Rolle
  const timer = startTimer(durationMs, {
    type: "gift",
    guildId: interaction.guild.id,
    userId: targetMember.id,
    roleId: role.id
  }, client);

  // Für Abfragen behalten wir weiterhin ein schnelles Mapping in giftData
  const expiresAt = Date.now() + durationMs;
  giftData.activeAssignments[targetMember.id] = expiresAt;
  saveGiftData();

  const readableDuration = days != null ? `${days} ${durationLabel}` : `${durationHours} Stunden`;
  return interaction.reply({
    content: `✅ **${targetMember.user.tag}** hat jetzt für **${readableDuration}** die DHBT+ Rolle erhalten.`,
    flags: 64
  });
}

function hasPermanentDhbtPlus(member) {
  if (!member || !member.roles) return false;
  if (!isDhbtPlusRole(member)) return false;
  try {
    const { loadTimers } = require("./timerRepository");
    const timers = loadTimers();
    const now = Date.now();
    const hasActiveRoleGrant = timers.some(t => (t.type === "roleGrant" || t.type === "gift") && t.userId === member.id && getDhbtPlusRoleIds().includes(t.roleId) && t.endTimestamp && t.endTimestamp > now);
    return !hasActiveRoleGrant;
  } catch (err) {
    return isDhbtPlusRole(member);
  }
}

async function handlePayCommand(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: "❌ Dieser Befehl kann nur auf einem Server benutzt werden.", flags: 64 });
  }

  const actorMember = interaction.member;
  if (!actorMember || !isDhbtPlusRole(actorMember)) {
    return interaction.reply({ content: "❌ Nur permanente DHBT+ Mitglieder können diesen Befehl nutzen.", flags: 64 });
  }

  if (!hasPermanentDhbtPlus(actorMember) && !isAdmin(actorMember)) {
    return interaction.reply({ content: "❌ Deine DHBT+ Rolle ist zeitlich begrenzt (z.B. durch den Shop). Nur dauerhafte Inhaber können diesen Befehl verwenden.", flags: 64 });
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "send") {
    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const reason = interaction.options.getString("reason") || "";

    if (!targetUser) {
      return interaction.reply({ content: "❌ Bitte gib einen Empfänger an.", flags: 64 });
    }
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: "❌ Du kannst dir selbst keine DHBT-Coins überweisen.", flags: 64 });
    }
    if (targetUser.bot) {
      return interaction.reply({ content: "❌ Du kannst keine DHBT-Coins an einen Bot überweisen.", flags: 64 });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: "❌ Der angegebene User konnte nicht gefunden werden.", flags: 64 });
    }

    const canTransfer = economy.canTransferBetweenUsers(interaction.guildId, interaction.user.id, amount, targetUser.id);
    if (!canTransfer.ok) {
      return interaction.reply({ content: `❌ ${canTransfer.reason}`, flags: 64 });
    }

    const transferred = economy.transferBetweenUsers(
      interaction.guildId,
      interaction.user.id,
      interaction.user.tag,
      targetUser.id,
      targetUser.tag,
      amount,
      `pay:${reason || "DHBT+ Überweisung"}`,
      interaction.client
    );

    if (!transferred) {
      return interaction.reply({ content: "❌ Die Überweisung konnte nicht durchgeführt werden. Bitte überprüfe deinen Kontostand.", flags: 64 });
    }

    return interaction.reply({ content: `✅ Du hast **${transferred} DHBT-Coins** an **${targetUser.tag}** überwiesen.${reason ? ` Grund: ${reason}` : ""}`, flags: 64 });
  }

  if (sub === "history") {
    const requestedUser = interaction.options.getUser("user") || interaction.user;
    if (requestedUser.id !== interaction.user.id && !isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Nur Administratoren können die Historie anderer Nutzer einsehen.", flags: 64 });
    }

    const historyEntries = economy.getPayHistory(interaction.guildId, requestedUser.id, 10);
    if (!historyEntries.length) {
      return interaction.reply({ content: `ℹ️ Keine Pay-Historie für **${requestedUser.tag}** gefunden.`, flags: 64 });
    }

    const lines = historyEntries.map(entry => {
      const when = new Date(entry.timestamp).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
      const direction = entry.senderId === requestedUser.id ? `➡️ gesendet an **${entry.recipientName}**` : `⬅️ erhalten von **${entry.senderName}**`;
      return `• ${when} — ${direction} — **${entry.amount} DHBT**${entry.reason ? ` — ${entry.reason}` : ""}`;
    });

    return interaction.reply({ content: `📜 Letzte Überweisungen für **${requestedUser.tag}**:
${lines.join("\n")}`, flags: 64 });
  }

  return interaction.reply({ content: "❌ Unbekannter Unterbefehl. Bitte verwende /pay send oder /pay history.", flags: 64 });
}

async function handleGiftDhbtPlusCommand(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: "❌ Dieser Befehl kann nur auf einem Server benutzt werden.", flags: 64 });
  }

  const actorMember = interaction.member;

  // If the user has DHBT+ but it's temporary, deny with a clearer message
  if (isDhbtPlusRole(actorMember) && !hasPermanentDhbtPlus(actorMember)) {
    return interaction.reply({ content: "❌ Deine DHBT+ Rolle ist zeitlich begrenzt (z.B. durch den Shop). Nur dauerhafte Inhaber können diesen Befehl verwenden.", flags: 64 });
  }

  if (!isGiftIssuer(actorMember) && !hasPermanentDhbtPlus(actorMember) && !isAdmin(actorMember)) {
    return interaction.reply({ content: "❌ Du brauchst die DHBT+ Rolle oder eine berechtigte Helferrolle, um diesen Befehl zu nutzen.", flags: 64 });
  }

  const actorId = interaction.user.id;
  const now = Date.now();
  const actorCooldown = giftData.cooldowns[actorId] || 0;

  if (actorCooldown > now) {
    const remainingMs = actorCooldown - now;
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    return interaction.reply({ content: `❌ Du kannst diesen Befehl erst in **${remainingHours} Stunden** wieder benutzen.`, flags: 64 });
  }

  const targetUser = interaction.options.getUser("user");
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: "❌ Der angegebene User konnte nicht gefunden werden.", flags: 64 });
  }

  const targetBlockedUntil = giftData.monthlyBlocks[targetMember.id] || 0;
  if (targetBlockedUntil > now && !isAdmin(actorMember)) {
    return interaction.reply({ content: "❌ Dieser User kann diesen Monat keine DHBT+ Rolle mehr bekommen.", flags: 64 });
  }

  const role = getDhbtPlusRole(interaction.guild);
  if (!role) {
    return interaction.reply({ content: "❌ Die DHBT+ Rolle ist auf diesem Server nicht vorhanden.", flags: 64 });
  }

  if (isDhbtPlusRole(targetMember)) {
    return interaction.reply({ content: `⚠️ **${targetMember.user.tag}** hat bereits die DHBT+ Rolle.`, flags: 64 });
  }

  try {
    await targetMember.roles.add(role, `DHBT+ Geschenk durch ${interaction.user.tag} für 7 Tage`);
    await badges.syncBadgesForMember(interaction.guildId, targetMember, false);
  } catch (error) {
    logger.discordError(`[GIFTS] Fehler beim Hinzufügen der Rolle: ${error.message}`, client);
    return interaction.reply({ content: "❌ Ich konnte die Rolle nicht vergeben. Bitte prüfe meine Berechtigungen.", flags: 64 });
  }

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const expiresAt = now + sevenDaysMs;
  giftData.activeAssignments[targetMember.id] = expiresAt;
  giftData.cooldowns[actorId] = now + sevenDaysMs;
  // block recipient from receiving another DHBT+ for 7 days
  giftData.monthlyBlocks[targetMember.id] = now + sevenDaysMs;
  saveGiftData();

  const { startTimer } = require("./timerService");
  startTimer(sevenDaysMs, {
    type: "gift",
    guildId: interaction.guild.id,
    userId: targetMember.id,
    roleId: role.id
  }, interaction.client);

  // DM-Embed an Empfänger
  const dmEmbed = new EmbedBuilder()
    .setTitle("🎁 Du hast DHBT+ erhalten")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Server", value: interaction.guild.name || interaction.guild.id, inline: false },
      { name: "Benutzer", value: `${targetMember.user.tag} (${targetMember.user.id})`, inline: false },
      { name: "Rolle", value: `DHBT+ (${role.name})`, inline: false },
      { name: "Dauer", value: `7 Tage`, inline: true },
      { name: "Ablauf", value: new Date(expiresAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }), inline: true },
      { name: "Vergeben von", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
    )
    .setTimestamp();

  try {
    await targetMember.user.send({ embeds: [dmEmbed] });
  } catch (err) {
    logger.discordError(`[GIFTS] Konnte DM nicht an ${targetMember.user.id} senden: ${err.message}`, client);
  }

  // Log-Embed in konfigurierten Discord-Log-Kanal senden (via shopExt)
  try {
    if (logger && typeof logger.sendEmbedToConfiguredChannels === "function") {
      await logger.sendEmbedToConfiguredChannels(dmEmbed, undefined, client);
    } else {
      logger.discordInfo(`[GIFTS] DHBT+ vergeben: ${targetMember.user.tag} für 7 Tage von ${interaction.user.tag}`, client);
    }
  } catch (err) {
    logger.discordError(`[GIFTS] Fehler beim Senden des Log-Embeds an Log-Kanal: ${err.message}`, client);
  }

  return interaction.reply({
    content: `✅ **${targetMember.user.tag}** hat jetzt für **7 Tage** die DHBT+ Rolle erhalten.`,
    flags: 64
  });
}

async function handleUserCommand(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: "❌ Dieser Befehl kann nur auf einem Server benutzt werden.", flags: 64 });
  }

  if (!isAdmin(interaction.member) && !isGiftIssuer(interaction.member)) {
    return interaction.reply({ content: "❌ Du hast keine Berechtigung für diesen Befehl.", flags: 64 });
  }

  const sub = interaction.options.getSubcommand();
  if (sub !== "give") {
    return interaction.reply({ content: "❌ Unbekannter Unterbefehl.", flags: 64 });
  }

  const targetUser = interaction.options.getUser("user");
  const targetRole = interaction.options.getRole("role");
  const duration = interaction.options.getInteger("duration");
  const reason = interaction.options.getString("reason") || "Keine Angabe";

  if (!targetUser || !targetRole) {
    return interaction.reply({ content: "❌ Bitte User und Rolle angeben.", flags: 64 });
  }

  if (!Number.isInteger(duration) || duration < 1 || duration > 720) {
    return interaction.reply({ content: "❌ Die Dauer muss in Stunden angegeben werden (1-720).", flags: 64 });
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return interaction.reply({ content: "❌ Der angegebene User konnte nicht gefunden werden.", flags: 64 });
  }

  if (targetMember.roles.cache.has(targetRole.id)) {
    return interaction.reply({ content: `⚠️ **${targetUser.tag}** hat bereits die Rolle **${targetRole.name}**.`, flags: 64 });
  }

  try {
    await targetMember.roles.add(targetRole, `Rolle vergeben von ${interaction.user.tag} für ${duration} Stunden`);
  } catch (error) {
    logger.discordError(`[USER] Fehler beim Vergaben der Rolle: ${error.message}`, client);
    return interaction.reply({ content: "❌ Ich konnte die Rolle nicht vergeben. Bitte prüfe meine Berechtigungen.", flags: 64 });
  }

  const durationMs = duration * 60 * 60 * 1000;
  const { startTimer } = require("./timerService");
  startTimer(durationMs, {
    type: "roleGrant",
    guildId: interaction.guild.id,
    userId: targetMember.id,
    roleId: targetRole.id,
    payload: {
      grantedBy: interaction.user.tag,
      reason
    }
  }, client);
  const expiresAtTs = Date.now() + durationMs;
  const expiresAt = new Date(expiresAtTs).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const dmEmbed = new EmbedBuilder()
    .setTitle("🎁 Dir wurde eine Rolle vergeben")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Server", value: interaction.guild.name || interaction.guild.id, inline: false },
      { name: "Benutzer", value: `${targetUser.tag} (${targetUser.id})`, inline: false },
      { name: "Rolle", value: `${targetRole.name} (${targetRole.id})`, inline: false },
      { name: "Dauer", value: `${duration} Stunden`, inline: true },
      { name: "Ablauf", value: expiresAt, inline: true },
      { name: "Grund", value: reason, inline: false },
      { name: "Vergeben von", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
    )
    .setTimestamp();

  try {
    await targetUser.send({ embeds: [dmEmbed] });
  } catch (err) {
    logger.discordError(`[USER] Konnte DM nicht an ${targetUser.id} senden: ${err.message}`, client);
  }

  // Zusätzlich: Log-Eintrag als Embed in den konfigurierten Discord-Log-Kanal senden
  try {
    if (logger && typeof logger.sendEmbedToConfiguredChannels === "function") {
      await logger.sendEmbedToConfiguredChannels(dmEmbed, undefined, client);
    } else {
      logger.discordInfo(`[USER] Rolle vergeben: ${targetRole.name} an ${targetUser.tag} für ${duration} Stunden by ${interaction.user.tag}`, client);
    }
  } catch (err) {
    logger.discordError(`[USER] Fehler beim Senden des Log-Embeds an Log-Kanal: ${err.message}`, client);
  }

  const embed = new EmbedBuilder()
    .setTitle("✅ Rolle vergeben")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Benutzer", value: `${targetUser.tag} (${targetUser.id})`, inline: false },
      { name: "Rolle", value: `${targetRole.name} (${targetRole.id})`, inline: false },
      { name: "Dauer", value: `${duration} Stunden`, inline: true },
      { name: "Grund", value: reason, inline: true },
      { name: "Vergeben von", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: 64 });
}

/**
 * Wird aufgerufen wenn eine Nachricht geschrieben wird
 * @param {string} userId
 * @param {User} user
 */
async function checkMessageAchievements(userId, user) {
  if (!userId || !user) return;
  
  // Zähle Messages pro User
  const achievements = getAchievementDefinitions();
  let messageCount = 0;
  
  // Einfache Implementierung: Für komplexere Message-Zählung könnten Sie eine Statistik-DB nutzen
  // Für jetzt prüfe ich nur, ob ein Trigger existiert
  const messageAchievements = achievements.filter(a => a.trigger?.type === 'messages');
  
  // Diese Logik könnte erweitert werden um tatsächliche Message-Counts zu speichern
  // Für jetzt ist es ein Placeholder
}


// ======================
// REGISTER COMMANDS
// (Wird beim clientReady-Event ausgeführt)
// ======================
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
const { ALLOWED_GUILDS } = require("./config");


// ======================
// READY
// ======================
// READY
// ======================
// READY
client.once("ready", async () => {
  logger.discordInfo(`[BOT_START] Bot gestartet als ${client.user.tag} (${client.user.id}) v${packageJson.version}`, client);

  // Guild-Daten Migration: Kopiere globale JSON-Dateien in guild_<id>/ Ordner
  try {
    const guildStorage = require("./guildStorage");
    const migrated = guildStorage.migrateAllGuilds();
    if (migrated > 0) logger.info(`[GUILD_STORAGE] ${migrated} Dateien in Guild-Ordner migriert.`);
  } catch (e) {
    logger.error(`[GUILD_STORAGE] Migration Fehler: ${e.message}`);
  }

  // Retroaktiv: Owner-Logins für alle Guilds erstellen wo noch keiner einen Login hat
  try {
    // Alle Guilds aus dem Discord-Cache nehmen (nicht nur ALLOWED_GUILDS)
    const allGuilds = client.guilds.cache.map(g => g.id);
    logger.info(`[OWNER_LOGIN] Prüfe ${allGuilds.length} Guilds: ${allGuilds.join(", ")}`);
    const path = require("path");
    const { loadJson, saveJsonSync } = require("./jsonStorage");
    for (const guildId of allGuilds) {
      if (!guildId) continue;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) { logger.warn(`[OWNER_LOGIN] Guild ${guildId} nicht im Cache`); continue; }
      const owner = await guild.fetchOwner().catch((e) => { logger.warn(`[OWNER_LOGIN] fetchOwner fehlgeschlagen für ${guild.name}: ${e.message}`); return null; });
      if (!owner) continue;

      const guildDir = path.join(__dirname, "..", "data", "guild_" + guildId);
      const rolesFile = path.join(guildDir, "roles.json");
      const profilesFile = path.join(guildDir, "profiles.json");

      // Prüfe ob Owner bereits einen Dashboard-Login hat (Passwort + Rolle in roles.json)
      const profiles = loadJson(profilesFile, {});
      const rolesConfig = loadJson(rolesFile, { roles: {}, users: {} });
      const ownerEntry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === owner.user.tag.toLowerCase());
      const hasRole = rolesConfig.users && rolesConfig.users[owner.user.tag];
      const hasLogin = ownerEntry && ownerEntry[1].password && hasRole;
      if (hasLogin) continue;

      // roles.json: Owner-Rolle
      if (!rolesConfig.roles) rolesConfig.roles = {};
      if (!rolesConfig.users) rolesConfig.users = {};
      if (!rolesConfig.roles.owner) {
        rolesConfig.roles.owner = {
          permissions: ["overview","coins","xp","zahlen","economy","userEdit","blacklist","weekly","shop","achievements","commands","dailyMissions","payHistory","voiceStats","xpConfig","roleManagement","dashboardAccess","maintenanceAccess","kartenSettings","kartenOrders","absenceManagement","probezeitManagement","dailyRewards","publicShop"]
        };
      }
      rolesConfig.users[owner.user.tag] = { role: "owner", userId: owner.id };
      saveJsonSync(rolesFile, rolesConfig);

      // profiles.json: Temporäres Passwort NUR wenn noch keines existiert
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
      let tempPwd = "";
      for (let i = 0; i < 12; i++) tempPwd += chars[Math.floor(Math.random() * chars.length)];
      const existing = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === owner.user.tag.toLowerCase());
      let passwordToSend;
      if (existing) {
        // Profil existiert bereits (z.B. MC-Link)
        if (existing[1].password) {
          // Hat bereits ein Passwort (MC-Link) — nicht überschreiben!
          // Stattdessen firstLogin setzen damit er es ändern kann
          existing[1].firstLogin = true;
          passwordToSend = existing[1].password; // Bestehendes Passwort senden
        } else {
          // Kein Passwort — neues setzen
          existing[1].password = tempPwd;
          existing[1].firstLogin = true;
          passwordToSend = tempPwd;
        }
      } else {
        // Neuer User
        profiles[owner.id] = { discordName: owner.user.tag, password: tempPwd, firstLogin: true, createdAt: Date.now() };
        passwordToSend = tempPwd;
      }
      saveJsonSync(profilesFile, profiles);

      // DM senden
      const { EmbedBuilder } = require("discord.js");
      const dashboardUrl = process.env.DASHBOARD_DOMAIN || `http://localhost:${process.env.DASHBOARD_PORT || 3002}`;
      const embed = new EmbedBuilder()
        .setTitle("Dashboard-Zugang eingerichtet")
        .setColor(0x2b2d31)
        .setDescription(`Hallo **${owner.user.username}**! Für deinen Server **${guild.name}** wurde ein Dashboard-Zugang eingerichtet.`)
        .addFields(
          { name: "Dashboard-URL", value: `${dashboardUrl}/dashboard/${guildId}` },
          { name: "Benutzername", value: `\`${owner.user.tag}\`` },
          { name: "Passwort", value: `\`${passwordToSend}\`` },
          { name: "Wichtig", value: "Du wirst beim ersten Login aufgefordert, dein Passwort zu ändern." }
        )
        .setFooter({ text: "DHBT Bot Dashboard" })
        .setTimestamp();
      await owner.send({ embeds: [embed] }).catch(() => {
        logger.warn(`[OWNER_LOGIN] Konnte keine DM an Owner ${owner.user.tag} für Guild ${guild.name} senden.`);
      });
      logger.info(`[OWNER_LOGIN] Retroaktiver Owner-Login für ${guild.name}: ${owner.user.tag}`);
    }
  } catch (e) {
    logger.error(`[OWNER_LOGIN] Retroaktive Erstellung Fehler: ${e.message}`);
  }

  // Starte Status-Tracking für Website (Ping, Uptime, Guilds, Users)
  botStatus.startRuntimeTracking(client);

  // Dashboard-Abstimmungen: aktive Polls laden und Ablauf-Timer wiederherstellen
  try { await pollSystem.init(client); } catch (e) { logger.error(`[POLL] Initialisierung fehlgeschlagen: ${e.message}`); }

  // Starte Ab/Anmeldungs-Queue-Verarbeitung für Discord-Embeds
  absenceManager.startQueueProcessor(client);

  // Minigame Restart-Rückzahlung: Einsätze unterbrochener Spiele zurückerstatten
  try { await miniGames.refundOnRestart(client); } catch (_) {}
  try { await werBinIch.refundOnRestart(client); } catch (_) {}

  // Bereinige alte Log-Dateien (älter als 7 Tage)
  cleanOldLogs();

  // Cache client in economy so getBotId always returns correct live bot ID
  economy.setClient(client);

  // Starte Live-Leaderboard-Updates
  economy.initLeaderboardUpdater(client);

  // Starte Live-Voice-Mission-Tracking (alle 5 Minuten)
  setInterval(() => trackLiveVoiceMissions(client), 5 * 60 * 1000);
  logger.discordInfo(`[VOICE_LIVE] Live-Voice-Mission-Tracking gestartet (alle 5 Minuten)`, client);

  // Stats-Cache für Website initial und alle 5 Minuten aktualisieren
  try {
    await statsCache.updateStatsCache(client);
    logger.discordInfo(`[STATS_CACHE] Stats-Cache initial aktualisiert`, client);
  } catch (e) {}
  setInterval(() => statsCache.updateStatsCache(client).catch(() => {}), 5 * 60 * 1000);

  // Karten-Bestellungen aus Website verarbeiten
  try {
    kartenOrders.startOrderProcessing(client);
    logger.discordInfo(`[KARTEN_ORDERS] Bestellungsverarbeitung gestartet`, client);
  } catch (e) {}

  // Builder-Aufträge aus Website verarbeiten
  try {
    builderOrders.startOrderProcessing(client);
    logger.discordInfo(`[BUILDER_ORDERS] Builder-Auftragsverarbeitung gestartet`, client);
  } catch (e) {}

  // Setze Client für Weekly Missions (für DM-Versand)
  weeklyMissionsModule.setClient(client);
  // Setze Client für XP-System (für Level-Up Embeds)
  xpSystem.setClient(client);

  // Rückwirkende Migration: Alle Achievements für bestehende Nutzer prüfen
  try {
    const { loadJson: _loadJson, DATA_DIR: _DATA_DIR } = require("./jsonStorage");
    const _path = require("path");
    const { checkAchievementTriggers: _checkTriggers, getCounterValue: _getCounter } = require("./achievements");
    const _dm = require("./dailyMissions");
    const _xpSys = require("./xpSystem");
    const _weeklyMod = require("./weeklyMissions");

    // Alle bekannten UserIDs sammeln
    const _profileFile = _path.join(_DATA_DIR, "profileCards.json");
    const _profiles = _loadJson(_profileFile, {});
    const _missionFile = _path.join(_DATA_DIR, "dailyMissions.json");
    const _missionData = _loadJson(_missionFile, {});
    const _weeklyFile = _path.join(_DATA_DIR, "weeklyMissions.json");
    const _weeklyData = _loadJson(_weeklyFile, {});
    const _xpData = _xpSys.getAllUsersXpData ? _xpSys.getAllUsersXpData() : {};

    const _allUserIds = new Set([
      ...Object.keys(_profiles),
      ...Object.keys(_missionData.userProgress || {}),
      ...Object.keys(_weeklyData.participants || {}),
      ...Object.keys(_xpData),
    ]);

    for (const uid of _allUserIds) {
      // Rahmen & Embed-Farben
      const _uprofile = _profiles[uid] || {};
      const framesOwned = Array.isArray(_uprofile.purchasedFrames) ? _uprofile.purchasedFrames.length : 0;
      const colorsOwned = Array.isArray(_uprofile.purchasedEmbedColors) ? _uprofile.purchasedEmbedColors.length : 0;
      if (framesOwned > 0) _checkTriggers(Haupt_GUILD, uid, "frames_owned", framesOwned, client).catch(() => {});
      if (colorsOwned > 0) _checkTriggers(Haupt_GUILD, uid, "embed_colors_owned", colorsOwned, client).catch(() => {});

      // Missions-Total & Streak & Kategorie
      const _missionsTotal = _getCounter(Haupt_GUILD, uid, "missions_total");
      if (_missionsTotal > 0) _checkTriggers(Haupt_GUILD, uid, "missions_total", _missionsTotal, client).catch(() => {});
      const _streak = _getCounter(Haupt_GUILD, uid, "missions_streak");
      if (_streak > 0) _checkTriggers(Haupt_GUILD, uid, "streak", _streak, client).catch(() => {});
      for (const cat of ["Chat", "Engagement", "Mini-Games", "Voice", "Daily", "XP"]) {
        const _catVal = _getCounter(Haupt_GUILD, uid, `missions_category_${cat}`);
        if (_catVal > 0) _checkTriggers(Haupt_GUILD, uid, "missions_category", _catVal, client, { category: cat }).catch(() => {});
      }

      // Mini-Games Wins
      const _gamesWon = _getCounter(Haupt_GUILD, uid, "games_won");
      if (_gamesWon > 0) _checkTriggers(Haupt_GUILD, uid, "games", _gamesWon, client).catch(() => {});

      // Voice-Minuten
      const _voiceMin = _getCounter(Haupt_GUILD, uid, "voice_minutes");
      if (_voiceMin > 0) _checkTriggers(Haupt_GUILD, uid, "voice", _voiceMin, client).catch(() => {});

      // Tips
      const _tipsTotal = _getCounter(Haupt_GUILD, uid, "tips_total");
      if (_tipsTotal > 0) _checkTriggers(Haupt_GUILD, uid, "tips", _tipsTotal, client).catch(() => {});

      // Weekly participations & top contributor
      const _weeklyParticipations = _getCounter(Haupt_GUILD, uid, "weekly_participations");
      if (_weeklyParticipations > 0) _checkTriggers(Haupt_GUILD, uid, "weekly_participations", _weeklyParticipations, client).catch(() => {});
      const _weeklyTop = _getCounter(Haupt_GUILD, uid, "weekly_top_contributor");
      if (_weeklyTop > 0) _checkTriggers(Haupt_GUILD, uid, "weekly_top_contributor", _weeklyTop, client).catch(() => {});

      // Level & Prestige aus XP-System
      const _xpUser = _xpData[uid];
      if (_xpUser) {
        if (_xpUser.level > 0) _checkTriggers(Haupt_GUILD, uid, "level", _xpUser.level, client).catch(() => {});
        if (_xpUser.prestige > 0) _checkTriggers(Haupt_GUILD, uid, "prestige", _xpUser.prestige, client).catch(() => {});
      }
    }

    logger.info("[MIGRATION] Achievement-Migration für alle Nutzer abgeschlossen.");
  } catch (e) {
    logger.error(`[MIGRATION] Fehler bei Achievement-Migration: ${e.message}`);
  }
  // Live-Embed beim Start posten/aktualisieren
  weeklyMissionsModule.updateLiveEmbed(Haupt_GUILD, client).catch(() => {});
  liveEmbeds.updateAllLiveEmbeds(client).catch(() => {});
  shardMerchant.init(client);
  auctionNotifier.start(client, 60_000);
  // Stündlicher Check: Weekly Mission Reset (Montag 00:00 MESZ)
  setInterval(() => {
    weeklyMissionsModule.resetWeeklyCampaign(Haupt_GUILD);
    weeklyMissionsModule.updateLiveEmbed(Haupt_GUILD, client).catch(() => {});
  }, 60 * 60 * 1000);
  // Live-Embeds jede Minute aktualisieren (XP + Zahlen-Spiel)
  setInterval(() => liveEmbeds.updateAllLiveEmbeds(client).catch(() => {}), 60 * 1000);

  // Registriere Slash-Commands für erlaubte Guilds (verwende CLIENT_ID aus env oder client.user.id)
  const applicationId = process.env.CLIENT_ID || client.user?.id;
  if (!applicationId) {
    logger.warn("Kein APPLICATION/CLIENT_ID gefunden — Befehle werden nicht registriert.");
  } else {
    for (const guildId of ALLOWED_GUILDS) {
      if (!guildId) continue;
      try {
        await rest.put(
          Routes.applicationGuildCommands(applicationId, guildId),
          { body: commands }
        );
        logger.info(`Commands für Guild ${guildId} geladen.`);
        logger.discordInfo(`[GUILD_REGISTRATION] Commands geladen für Guild ${guildId}`, client);
      } catch (error) {
        logger.error(`Fehler beim Laden der Commands für Guild ${guildId}: ${error?.message || error}`);
        logger.discordError(`[GUILD_REGISTRATION] Fehler beim Laden der Commands für Guild ${guildId}: ${error?.message || error}`, client);
      }
    }
  }

  // Hilfsfunktion: Commands für eine einzelne Guild registrieren
  async function registerCommandsForGuild(guildId) {
    if (!applicationId || !guildId) return;
    try {
      await rest.put(
        Routes.applicationGuildCommands(applicationId, guildId),
        { body: commands }
      );
      logger.info(`[GUILD_AUTO_ADD] Commands für neue Guild ${guildId} registriert.`);
    } catch (error) {
      logger.error(`[GUILD_AUTO_ADD] Fehler beim Registrieren der Commands für Guild ${guildId}: ${error?.message || error}`);
    }
  }

  // Lade und plane alle persistierten Timer
  const { loadAndScheduleAll } = require("./timerService");
  loadAndScheduleAll(client);
  logger.discordInfo(`[TIMER_SERVICE] Alle Timer wiederhergestellt.`, client);

  // Wiederherstellung aktiver Probezeiten
  try {
    await probezeit.restoreProbezeitTimers(client);
  } catch (err) {
    logger.discordError(`[PROBEZEIT] Fehler beim Wiederherstellen der Timer: ${err.message}`, client);
  }

  // Wiederherstellung des Zahlen-Minigames
  try {
    await zahlenGame.restoreAfterRestart(client);
    logger.discordInfo(`[ZAHLEN_GAME] Zahlen-Minigame wiederhergestellt.`, client);
  } catch (err) {
    logger.discordError(`[ZAHLEN_GAME] Fehler beim Wiederherstellen: ${err.message}`, client);
  }

  // Restore persisted voice sessions from DB + verpasste Weekly-Minuten nachbuchen
  try {
    if (voiceTracker && typeof voiceTracker.restoreSessionsAndCatchup === "function") {
      voiceTracker.restoreSessionsAndCatchup(Haupt_GUILD, weeklyMissionsModule);
      logger.discordInfo(`[VOICE] Persistente Voice-Sessions wiederhergestellt + Catchup gestartet.`, client);
    }
  } catch (err) {
    logger.discordError(`[VOICE] Fehler beim Wiederherstellen persistenter Voice-Sessions: ${err.message}`, client);
  }

  // Phantom-Sessions bereinigen: prüfe ob wiederhergestellte User wirklich im Voice-Channel sind
  try {
    setTimeout(() => {
      const activeUsers = voiceTracker.getActiveVoiceUsers(Haupt_GUILD);
      let removed = 0;
      for (const userId of activeUsers) {
        let foundInVoice = false;
        for (const guild of client.guilds.cache.values()) {
          const member = guild.members.cache.get(userId);
          if (member && member.voice && member.voice.channelId) {
            foundInVoice = true;
            break;
          }
        }
        if (!foundInVoice) {
          voiceTracker.stopVoiceSession(Haupt_GUILD, userId);
          removed++;
          logger.discordInfo(`[VOICE] Phantom-Session entfernt: ${userId}`, client);
        }
      }
      if (removed > 0) logger.discordInfo(`[VOICE] ${removed} Phantom-Session(s) beim Start bereinigt.`, client);
    }, 5000); // 5s warten bis Discord-Cache gefüllt ist
  } catch (err) {
    logger.discordError(`[VOICE] Fehler beim Bereinigen von Phantom-Sessions: ${err.message}`, client);
  }

  // Restore persisted game sessions from DB (falls vorhanden)

  // Aktualisiere die Tipp-Liste beim Bot-Start, damit alte Tipp-Nachrichten wiedergefunden oder neu erstellt werden.
  try {
    await economy.updateTippChannelMessage(client, Haupt_GUILD);
    logger.discordInfo(`[TIPP_LISTE] Tipp-Liste beim Start aktualisiert.`, client);
  } catch (error) {
    logger.discordError(`[TIPP_LISTE] Fehler beim Aktualisieren der Tipp-Liste beim Start: ${error?.message || error}`, client);
  }

  // Jede Minute: Voice-Achievements + Live-Coins + Online-Zeit für Voice-User
  setInterval(() => {
    checkActiveVoiceAchievements(client);
    try { if (xp && typeof xp.liveAwardAllVoiceUsers === "function") xp.liveAwardAllVoiceUsers(client, Haupt_GUILD); } catch (e) {}
    // Online-Zeit für alle aktiven Voice-User +1 Minute
    try {
      const activeUsers = voiceTracker.getActiveVoiceUsers(Haupt_GUILD);
      for (const uid of activeUsers) {
        const session = voiceTracker.getVoiceSession(Haupt_GUILD, uid);
        if (session && !session.channelBlacklisted) incrementCounter(Haupt_GUILD, uid, "online_minutes", 1);
      }
    } catch (e) {}
  }, 60 * 1000);
});



// ======================
// MESSAGE REWARDS
// ============ MESSAGE REWARDS (Neue Version: 1 Coin alle 3-6 Nachrichten) ============
const messageRewardTracking = new Map(); // userId -> { messageCount, nextRewardThreshold }
const messageSpamTracking = new Map(); // userId -> [{ timestamp, content }]

function isSpamMessage(message) {
  if (!message || !message.author || message.author.bot) return false;

  const userId = message.author.id;
  const now = Date.now();
  const recentMessages = messageSpamTracking.get(userId) || [];

  // Entferne alte Einträge (> 15 Sekunden)
  const validMessages = recentMessages.filter(entry => now - entry.timestamp <= 15_000);
  const sameContentCount = validMessages.filter(entry => entry.content === message.content).length;

  // Wenn identische Nachricht mehrfach kurz hintereinander gesendet wurde, ist es Spam
  if (sameContentCount >= 2) {
    messageSpamTracking.set(userId, [...validMessages, { timestamp: now, content: message.content }]);
    return true;
  }

  // Wenn zu viele Nachrichten innerhalb kurzer Zeit gesendet werden, ist es Spam
  const messagesInWindow = validMessages.filter(entry => now - entry.timestamp <= 5_000).length;
  validMessages.push({ timestamp: now, content: message.content });
  messageSpamTracking.set(userId, validMessages);

  if (messagesInWindow >= 5) {
    return true;
  }

  return false;
}

client.on("messageCreate", async message => {
  handleMcMessage(message);
  profileSystem.handleMcJoinLeaveMessage(message, client).catch(() => {});
  ticketSystem.trackMessage(message).catch(() => {});
  if (message.author.bot || !message.guild) return;
  const config = economy.getConfig(message.guild.id);
  const userId = message.author.id;
  cacheUser(message.author);

  // Initialisiere oder hole Tracking-Daten
  if (!messageRewardTracking.has(userId)) {
    const randomThreshold = Math.floor(Math.random() * 4) + 3; // 3-6
    messageRewardTracking.set(userId, {
      messageCount: 0,
      nextRewardThreshold: randomThreshold
    });
  }

  const tracking = messageRewardTracking.get(userId);
  tracking.messageCount++;
  const blacklisted = economy.isChannelBlacklisted(message.guild.id, message.channelId);
  const isSpam = isSpamMessage(message);

  if (!blacklisted && !isSpam) {
    // Inkrementiere Message-Counter für /online Befehl (als Online-Punkte, keine DHBT-Coins)
    incrementCounter(message.guild.id, userId, "messages", 1);
    // Online-Zeit: 1 Minute pro Nachricht (Aktivitätsindikator)
    incrementCounter(message.guild.id, userId, "online_minutes", 1);
    // Chat-Coin- + XP-Reward
    try {
      if (xp && typeof xp.awardChatPoints === "function") {
        xp.awardChatPoints(message.guild.id, userId, message.author.username, message.channelId, client);
      }
    } catch (e) {}
  }

  // Prüfe Message-Achievements
  checkMessageAchievements(userId, message.author);

  // Live-track daily missions: chat-type missions
  try {
    const mission = dailyMissions.getTodayMission(message.guild.id, userId);
    if (!blacklisted && mission && mission.id && mission.id.startsWith("chat_") && shouldTrackChatMission(message, mission)) {
      dailyMissions.incrementProgress(message.guild.id, userId, mission.id, 1);
      const completion = dailyMissions.checkMissionCompletion(message.guild.id, userId, message.member, client);
      if (completion.completed) {
        await checkMissionAchievements(userId, message.author);
      }
    }

      // Weekly missions: increment chat weekly progress if a weekly campaign is active
      try {
        const weekly = require("./weeklyMissions");
        if (weekly.isWeeklyActive(message.guild.id)) {
          const campaign = weekly.getActiveCampaign(message.guild.id);
          if (campaign && Array.isArray(campaign.missions)) {
            // look for chat-type weekly missions
            const chatMissions = campaign.missions.filter(m => m.id.startsWith("weekly_chat"));
            for (const wm of chatMissions) {
              weekly.incrementProgress(message.guild.id, userId, wm.id, 1, client);
            }

            // Track online time (1 minute per message, capped reasonably)
            const onlineMissions = campaign.missions.filter(m => m.id.startsWith("weekly_online"));
            for (const wm of onlineMissions) {
              weekly.incrementProgress(message.guild.id, userId, wm.id, 1, client);
            }
          }
        }
      } catch (e) {}

  } catch (err) {
    logger.discordError(`[DAILY_MISSIONS] Fehler beim Tracken der Daily-Missionen: ${err.message}`, client);
  }

  // Zahlen-Minigame
  try {
    await zahlenGame.handleMessage(client, message);
  } catch (err) {
    logger.discordError(`[ZAHLEN_GAME] Fehler beim Verarbeiten einer Nachricht: ${err.message}`, client);
  }
});

function shouldTrackChatMission(message, mission) {
  if (!message || message.author?.bot || !mission || !mission.id) return false;
  const id = mission.id;
  const mentions = message.mentions?.users?.filter(u => u.id !== message.author.id).size || 0;

  if (id.endsWith("_msgs")) {
    return true;
  }
  if (id.startsWith("chat_reply_")) {
    return !!message.reference;
  }
  if (id.startsWith("chat_mention_")) {
    return mentions > 0;
  }
  if (id.startsWith("chat_attach_")) {
    return message.attachments?.size > 0;
  }
  if (id.startsWith("chat_sticker_")) {
    return message.stickers?.size > 0;
  }
  if (id.startsWith("chat_thread_reply_")) {
    return typeof message.channel?.isThread === "function" && message.channel.isThread();
  }
  return false;
}

async function trackReactionMissionProgress(reaction, user) {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch (err) {
    logger.discordError(`[DAILY_MISSIONS] Fehler beim Laden der Reaction/Message Partial: ${err.message}`, client);
    return;
  }

  const message = reaction.message;
  if (!message.guild) return;

  const reactorId = user.id;
  const authorId = message.author?.id;

  const processProgress = async (userId, missionId, reactorId) => {
    if (!missionId) return;
    const mission = dailyMissions.getTodayMission(message.guild.id, userId);
    if (!mission || mission.id !== missionId) return;

    if (dailyMissions.hasReactionReceipt(message.guild.id, userId, message.id, reactorId)) return;
    dailyMissions.addReactionReceipt(message.guild.id, userId, message.id, reactorId);

    dailyMissions.incrementProgress(message.guild.id, userId, mission.id, 1);
    const pct = dailyMissions.getProgressPercent(message.guild.id, userId, mission.id);
    if (pct >= 100) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      const res = dailyMissions.finalizeMission(message.guild.id, userId, member, client);
      if (res && res.success) {
        await checkMissionAchievements(userId, userId === reactorId ? user : message.author);
      }
    }
  };

  // Reactor progress for giving reactions
  const reactorMission = dailyMissions.getTodayMission(message.guild.id, reactorId);
  if (reactorMission && reactorMission.id.endsWith("_given")) {
    await processProgress(reactorId, reactorMission.id, reactorId);
  }

  // Message author progress for received reactions
  if (authorId && authorId !== reactorId) {
    const authorMission = dailyMissions.getTodayMission(message.guild.id, authorId);
    if (authorMission && authorMission.id.endsWith("_received")) {
      await processProgress(authorId, authorMission.id, reactorId);
    }
  }

  // Weekly missions: track reaction progress
  try {
    const weekly = require("./weeklyMissions");
    if (weekly.isWeeklyActive(message.guild.id)) {
      const campaign = weekly.getActiveCampaign(message.guild.id);
      if (campaign && Array.isArray(campaign.missions)) {
        const reactionMissions = campaign.missions.filter(m => m.id.startsWith("weekly_reactions"));
        for (const wm of reactionMissions) {
          weekly.incrementProgress(message.guild.id, reactorId, wm.id, 1, client);
        }
      }
    }
  } catch (e) {}
}

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    await trackReactionMissionProgress(reaction, user);
  } catch (err) {
    logger.discordError(`[DAILY_MISSIONS] Fehler beim Tracken von Reaction-Missionen: ${err.message}`, client);
  }
});


// ======================
// INTERACTION HANDLER
// ======================
client.on("interactionCreate", interaction => {
  if (interaction.user && !interaction.user.bot) cacheUser(interaction.user);
  processInteraction(interaction).catch(err => {
    logger.discordError(`[INTERACTIONS] Fehler bei der Verarbeitung der Interaktion: ${err.message}`, client);
    if (interaction.replied || interaction.deferred) {
      interaction.followUp({ content: "❌ Interner Fehler", flags: 64 }).catch(() => {});
    } else if (interaction.isRepliable && interaction.isRepliable()) {
      interaction.reply({ content: "❌ Interner Fehler", flags: 64 }).catch(() => {});
    }
  });
});

async function processInteraction(interaction) {
  // Guild-Whitelist Check
  // Guild whitelist: allow most commands only on configured guilds
  // Exception: allow `/online` globally
  if (interaction.guild && !isAllowedGuild(interaction.guild.id)) {
    if (interaction.isChatInputCommand() && interaction.commandName === "online") {
      // allow online command on all servers
    } else {
      if (interaction.isRepliable()) {
        return interaction.reply({
          content: "❌ Dieser Befehl ist auf diesem Server nicht aktiviert.",
          flags: 64
        });
      }
      return;
    }
  }

  // Live-Update: Tipp-Nachricht (nicht bei Minigame-Buttons/Modals – spart Zeit)
  try {
    const isMiniGameInteraction =
      (interaction.isButton() || interaction.isModalSubmit?.()) &&
      typeof interaction.customId === "string" &&
      /^(duell|ssp|tictactoe|ttt):/.test(interaction.customId);

    if (!isMiniGameInteraction && interaction.client && economy && typeof economy.getTippChannel === 'function' && typeof economy.getServerFromGuildId === 'function') {
      const server = economy.getServerFromGuildId(interaction.guildId);
      if (economy.getTippChannel(interaction.guildId, server)) {
        // fire-and-forget; Fehler werden intern geloggt
        economy.updateTippChannelMessage(interaction.client, interaction.guildId, server).catch(() => {});
      }
    }
  } catch (err) {
    // still continue processing the interaction
  }

  if (interaction.isAutocomplete && interaction.isAutocomplete()) {
    if (interaction.commandName === "command") {
      const focusedValue = interaction.options.getFocused();
      return interaction.respond(getCommandAutocompleteOptions(focusedValue));
    }
  }

  if (interaction.isChatInputCommand()) {
    const commandState = getCommandSettings(interaction.guildId, interaction.commandName);
    if (interaction.commandName !== "command" && commandState.active === false) {
      return interaction.reply({
        content: `❌ Dieser Befehl ist momentan deaktiviert.${commandState.reason ? ` Grund: ${commandState.reason}` : ""}`,
        flags: 64
      });
    }

    // Shard-Händler
    if (interaction.commandName === "shards") return shardMerchant.handleCommand(interaction);

    // Auktionshaus Einstellungen
    if (interaction.commandName === "settings") return auctionNotifier.handleSettingsCommand(interaction);

    // Spiel-Befehle
    if (interaction.commandName === "spiel") return handleSpielCommand(interaction);
    if (interaction.commandName === "spiel-loeschen") return handleSpielLoeschenCommand(interaction);
    
    if (interaction.commandName === "tipp-config") return handleTippConfigCommand(interaction);
    if (interaction.commandName === "tipp-setzen") return handleOwnerSetTipp(interaction);
    if (interaction.commandName === "ergebnis") return handleErgebnisCommand(interaction, client);
    if (interaction.commandName === "spiele") return handleSpieleListen(interaction);
    if (interaction.commandName === "tipps") return handleTippsCommand(interaction);

    // Event-System
    if (interaction.commandName === "event") return handleEventCommand(interaction);
    if (interaction.commandName === "eventcoins-uebertragen") return handleEventCoinsTransfer(interaction, client);

    // Reward-Config
    if (interaction.commandName === "reward-config") return xp.handleRewardConfigCommand(interaction);

    // Economy & Shop
    if (interaction.commandName === "addcoins") {
      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      economy.addCoins(interaction.guildId, user.id, user.username, amount, "admin-add");
      logger.discordInfo(`[ADMIN] Coins hinzugefügt: ${amount} an ${user.username} (${user.id}) durch ${interaction.user.tag}`, interaction.client);
      const reply = interaction.reply({ content: `✅ ${amount} DHBT-Coins zu **${user.username}** hinzugefügt.`, flags: 64 });
      economy.updateDhbtLeaderboardInChannel(interaction.client, interaction.guildId).catch(err => {
        logger.discordError(`[ADMIN] Fehler beim Aktualisieren des DHBT-Leaderboards nach addcoins: ${err.message}`, interaction.client);
      });
      return reply;
    }

    if (interaction.commandName === "removecoins") {
      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      economy.removeCoins(interaction.guildId, user.id, user.username, amount, "admin-remove");
      logger.discordInfo(`[ADMIN] Coins entfernt: ${amount} von ${user.username} (${user.id}) durch ${interaction.user.tag}`, interaction.client);
      const reply = interaction.reply({ content: `✅ ${amount} DHBT-Coins von **${user.username}** entfernt.`, flags: 64 });
      economy.updateLeaderboardMessage(interaction.client, true, interaction.guildId).catch(err => {
        logger.discordError(`[ADMIN] Fehler beim Aktualisieren des Leaderboard-Nachricht nach removecoins: ${err.message}`, interaction.client);
      });
      return reply;
    }

    if (interaction.commandName === "setcoins") {
      const user = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      economy.setCoins(interaction.guildId, user.id, user.username, amount);
      logger.discordInfo(`[ADMIN] Coins gesetzt: ${user.username} (${user.id}) auf ${amount} durch ${interaction.user.tag}`, interaction.client);
      const reply = interaction.reply({ content: `✅ DHBT-Coins von **${user.username}** auf **${amount}** gesetzt.`, flags: 64 });
      economy.updateLeaderboardMessage(interaction.client, true, interaction.guildId).catch(err => {
        logger.discordError(`[ADMIN] Fehler beim Aktualisieren des Leaderboard-Nachricht nach setcoins: ${err.message}`, interaction.client);
      });
      return reply;
    }

    if (interaction.commandName === "coins") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      if (targetUser.id !== interaction.user.id && !isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung, den Kontostand anderer Nutzer anzusehen.", flags: 64 });
      }
      const balance = economy.getCoins(interaction.guildId, targetUser.id);
      const isSelf = targetUser.id === interaction.user.id;
      const replyText = isSelf
        ? `<:DHBT_COIN:1512242287411990588> **${targetUser.username}**, dein Kontostand beträgt **${balance} DHBT-Coins**.`
        : `<:DHBT_COIN:1512242287411990588> **${targetUser.username}** hat **${balance} DHBT-Coins**.`;
      return interaction.reply({ content: replyText, flags: 64 });
    }

    if (interaction.commandName === "pay") return handlePayCommand(interaction);
    if (interaction.commandName === "help") return handleHelpCommand(interaction);
    if (interaction.commandName === "gift") return handleGiftCommand(interaction);
    if (interaction.commandName === "gift-dhbt-plus") return handleGiftDhbtPlusCommand(interaction);
    if (interaction.commandName === "user") return handleUserCommand(interaction);

    if (interaction.commandName === "channel-blacklist") return handleChannelBlacklistCommand(interaction);
    if (interaction.commandName === "leaderboard-blacklist") return handleLeaderboardBlacklistCommand(interaction);
    if (interaction.commandName === "leaderboard-config") return handleLeaderboardConfigCommand(interaction);
    if (interaction.commandName === "shop-config") return shop.handleShopConfigCommand(interaction);
    if (interaction.commandName === "shop-add") return handleShopAddExtended(interaction);
    if (interaction.commandName === "restock") return handleShopRestockExtended(interaction);
    if (interaction.commandName === "shop-remove") return handleShopRemoveExtended(interaction);

    if (interaction.commandName === "convert-event") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      const eventId = interaction.options.getString("eventid");
      try {
        const result = economy.convertEvent(interaction.guildId, eventId);
        await economy.updateLeaderboardMessage(interaction.client, true, interaction.guildId);
        logger.discordInfo(`[EVENTS] Event konvertiert: ${result.displayName} (${eventId}) durch ${interaction.user.tag} - ${result.conversions.length} Spieler`, interaction.client);
        return interaction.reply({ content: `✅ Event **${result.displayName}** wurde konvertiert. ${result.conversions.length} Spieler erhalten DHBT-Coins.`, flags: 64 });
      } catch (error) {
        logger.discordError(`[EVENTS] Fehler beim Konvertieren des Events ${eventId}: ${error.message}`, interaction.client);
        return interaction.reply({ content: `❌ ${error.message}`, flags: 64 });
      }
    }

    if (interaction.commandName === "convert-all-events") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      const results = economy.convertAllEvents(interaction.guildId);
      await economy.updateLeaderboardMessage(interaction.client, true, interaction.guildId);
      logger.discordInfo(`[EVENTS] Alle Events konvertiert durch ${interaction.user.tag}. Anzahl: ${results.length}`, interaction.client);
      return interaction.reply({ content: results.length ? `✅ ${results.length} Events wurden konvertiert.` : "ℹ️ Keine aktiven Events zum Konvertieren gefunden.", flags: 64 });
    }

    if (interaction.commandName === "reload-config") {
      if (!isAdmin(interaction.member) && !isHelpAdminRole(interaction.member) && !isShopHelperRole(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      economy.reloadConfig(interaction.guildId);
      logger.discordInfo(`[ADMIN] Konfiguration neu geladen durch ${interaction.user.tag}`, interaction.client);
      return interaction.reply({ content: "✅ Konfiguration neu geladen.", flags: 64 });
    }

    if (interaction.commandName === "ranking") {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ content: "❌ Du hast keine Berechtigung.", flags: 64 });
      }
      await economy.updateLeaderboardMessage(interaction.client, true, interaction.guildId);
      logger.discordInfo(`[ADMIN] Live Ranking aktualisiert durch ${interaction.user.tag}`, interaction.client);
      return interaction.reply({ content: "✅ Live Ranking wurde aktualisiert.", flags: 64 });
    }

    // ============ ADMIN TOOLS ============
    if (interaction.commandName === "command") return handleCommandCommand(interaction);
    if (interaction.commandName === "admin") return handleAdminCommand(interaction);
    if (interaction.commandName === "melden") return handleFeedbackCommand(interaction, client);
    if (interaction.commandName === "badge-add") return handleBadgeAddCommand(interaction);
    if (interaction.commandName === "badge-remove") return handleBadgeRemoveCommand(interaction);
    if (interaction.commandName === "reset-all") return handleResetAllCommand(interaction);
    if (interaction.commandName === "mission-reset") return handleMissionResetCommand(interaction);

    // ============ NEUE MODULE HANDLERS ============
    // Daily Rewards
    if (interaction.commandName === "daily") return handleDailyCommand(interaction);
    if (interaction.commandName === "mission") return handleMissionCommand(interaction);

    // Minigames
    if (interaction.commandName === "minigames") {
      if (interaction.options.getString("game") === "wer_bin_ich") return werBinIch.handleWerBinIchCommand(interaction);
      return miniGames.handleMinigamesCommand(interaction);
    }

    // Achievements
    if (interaction.commandName === "achievements" || interaction.commandName === "erfolge") return handleAchievementsCommand(interaction);

    if (interaction.commandName === "weekly-mission") {
      // Check if command is in allowed channel for this guild
      let allowedChannelId;
      
      if (interaction.guildId === Haupt_GUILD) {
        allowedChannelId = WEEKLY_MISSION_CHANNELS.main;
      } else if (interaction.guildId === TEST_GUILD) {
        allowedChannelId = WEEKLY_MISSION_CHANNELS.test;
      }
      
      if (allowedChannelId && interaction.channelId !== allowedChannelId) {
        return interaction.reply({
          content: `❌ Der **weekly-mission** Befehl ist nicht in diesem Kanal verfügbar.`,
          ephemeral: true
        });
      }
      return weeklyMissionsModule.handleWeeklyMissionCommand(interaction);
    }

    // Profile Cards
    if (interaction.commandName === "profil") return handleProfileCommand(interaction);
    if (interaction.commandName === "profilanpassungen") return handleProfileCustomizationCommand(interaction);
    if (interaction.commandName === "online") return handleOnlineCommand(interaction);
    if (interaction.commandName === "bauauftrag") return builderOrders.handleInteraction(interaction);
    if (interaction.commandName === "mc-register") return profileSystem.handleMcRegisterCommand(interaction, client);
    if (interaction.commandName === "passwort-vergessen") return profileSystem.handleForgotPasswordCommand(interaction);
    if (interaction.commandName === "prestige") {
      const confirm = interaction.options.getBoolean("confirm");
      if (confirm) return xpSystem.handlePrestigeConfirmCommand(interaction);
      return xpSystem.handlePrestigeCommand(interaction);
    }
    
    // FAQ Command with optional search
    if (interaction.commandName === "faq") {
      const searchTerm = interaction.options.getString("search");
      if (searchTerm) {
        return handleFaqSearch(interaction, searchTerm);
      }
      return handleFaqCommand(interaction);
    }
    
    if (interaction.commandName === "badges-remove") return handleBadgeSelfRemoveCommand(interaction);
    if (interaction.commandName === "closerequest") return handleCloseRequestCommand(interaction);

    // Community Ranking
    if (interaction.commandName === "ranking-coins") return handleRankingCommand(interaction);
    if (interaction.commandName === "ranking-level") return handleLevelRankingCommand(interaction);
    if (interaction.commandName === "ranking-type") return handleRankingTypesCommand(interaction);

    // Probezeit-System
    if (interaction.commandName === "probezeit") return handleProbezeitCommand(interaction);
    if (interaction.commandName === "probezeit-abbrechen") return handleProbezeitAbbrechenCommand(interaction);
    if (interaction.commandName === "probezeit-verlaengern") return handleProbezeitVerlaengernCommand(interaction);
    if (interaction.commandName === "probezeit-liste") return handleProbezeitListeCommand(interaction);

    // Zahlen-Minigame
    if (interaction.commandName === "zahlen") {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "konfigurieren") return handleZahlenConfigCommand(interaction);
      if (subcommand === "restore") return handleZahlenRestoreCommand(interaction);
      if (subcommand === "status") return handleZahlenStatusCommand(interaction);
      if (subcommand === "leaderboard") return handleZahlenLeaderboardCommand(interaction);
    }
  }

  // Button Handler
  if (interaction.isButton()) {
    if (interaction.customId.startsWith("dhbt_poll:")) {
      const handled = await pollSystem.handleButton(interaction);
      if (handled) return;
    }
    if (interaction.customId.startsWith("embed_event_")) return embedEvents.handleButton(interaction);
    if (interaction.customId.startsWith("ticket_")) {
      const handled = await ticketSystem.handleInteraction(interaction);
      if (handled) return;
    }
    // Auction settings buttons
    if (interaction.customId.startsWith("auction_setting_")) return auctionNotifier.toggleSetting(interaction);
    // Market Buttons
    if (interaction.customId.startsWith("market_")) {
      return handleMarketInteraction(interaction);
    }
    // Auction House Buttons
    if (interaction.customId.startsWith("auction_")) {
      return auctionCommand.handleAuctionInteraction(interaction);
    }
    // Shard Merchant Buttons
    if (interaction.customId.startsWith("shard_")) {
      return shardMerchant.handleComponentInteraction(interaction);
    }
    const builderBtn = await builderOrders.handleInteraction(interaction);
    if (builderBtn !== null) return builderBtn;
    if (interaction.customId.startsWith("spiel_")) return handleSpielButton(interaction);
    if (interaction.customId.startsWith("wer_bin_ich_")) return werBinIch.handleButtons(interaction);
    if (interaction.customId.startsWith("challenge:")) return miniGames.handleChallengeButtons(interaction);
    if (interaction.customId.startsWith("ssp:")) return miniGames.handleSSPButtons(interaction);
    if (interaction.customId.startsWith("duell:")) return miniGames.handleDuellButtons(interaction);
    if (interaction.customId.startsWith("ttt:")) return miniGames.handleTicTacToeButtons(interaction);
    if (interaction.customId.startsWith("show_user_level_coins_")) return handleShowUserLevelButton(interaction);
    if (interaction.customId === "xp_show_my_level") return handleShowMyXpLevelButton(interaction);
    if (interaction.customId === "dhbt_show_my_position") return economy.handleDhbtLeaderboardButton(interaction);
    if (interaction.customId.startsWith("event_show_my_position_")) return economy.handleEventLeaderboardButton(interaction);
    
    // Order confirmation buttons
    if (interaction.customId.startsWith("order_confirm_buyer_")) {
      const threadId = interaction.customId.replace("order_confirm_buyer_", "");
      return shopExt.handleOrderConfirmation(interaction, threadId, "buyer");
    }
    if (interaction.customId === "profil_home") {
      return handleProfileCustomizationCommand(interaction);
    }
    if (interaction.customId === "profil_back_frameshop") {
      return handleProfileFrameShop(interaction);
    }
    if (interaction.customId === "profil_back_embedcolorshop") {
      return handleEmbedColorShop(interaction);
    }
    if (interaction.customId === "profil_back_customization") {
      return handleProfileCustomizationCommand(interaction);
    }
    if (interaction.customId === "profil_back_rahmen") {
      return handleRahmenCustomization(interaction);
    }
    if (interaction.customId === "profil_back_title") {
      return handleTitelCustomization(interaction);
    }
    if (interaction.customId === "profil_back") {
      // return to the main profile customization menu
      return handleProfileCustomizationCommand(interaction);
    }
    
    if (interaction.customId.startsWith("order_confirm_helper_")) {
      const threadId = interaction.customId.replace("order_confirm_helper_", "");
      return shopExt.handleOrderConfirmation(interaction, threadId, "helper");
    }

    if (interaction.customId.startsWith("order_close_confirm_")) {
      const threadId = interaction.customId.replace("order_close_confirm_", "");
      return shopExt.handleCloseRequestDecision(interaction, threadId, true);
    }

    if (interaction.customId.startsWith("order_close_reject_")) {
      const threadId = interaction.customId.replace("order_close_reject_", "");
      return shopExt.handleCloseRequestDecision(interaction, threadId, false);
    }
    
    if (interaction.customId.startsWith("order_close_")) {
      const threadId = interaction.customId.replace("order_close_", "");
      return shopExt.closeOrder(interaction, threadId);
    }
    if (interaction.customId === "shop_open_public" || interaction.customId === "shop_open_clan") {
      return shop.handleShopOpenButton(interaction);
    }

    // Karten-Bestellungen
    if (interaction.customId.startsWith("karten_claim:")) {
      return kartenOrders.handleInteraction(interaction);
    }
    if (interaction.customId.startsWith("karten_close_accept_")) {
      const threadId = interaction.customId.replace("karten_close_accept_", "");
      return shopExt.handleKartenCloseAcceptButton(interaction, threadId);
    }
    if (interaction.customId.startsWith("karten_close_deny_")) {
      const threadId = interaction.customId.replace("karten_close_deny_", "");
      return shopExt.handleKartenCloseDenyButton(interaction, threadId);
    }
    if (interaction.customId.startsWith("builder_close_accept_")) {
      const threadId = interaction.customId.replace("builder_close_accept_", "");
      return shopExt.handleBuilderCloseAcceptButton(interaction, threadId);
    }
    if (interaction.customId.startsWith("builder_close_deny_")) {
      const threadId = interaction.customId.replace("builder_close_deny_", "");
      return shopExt.handleBuilderCloseDenyButton(interaction, threadId);
    }
  }

  // Modal Handler
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("ticket_")) {
      const handled = await ticketSystem.handleInteraction(interaction);
      if (handled) return;
    }
    const builderModal = await builderOrders.handleInteraction(interaction);
    if (builderModal !== null) return builderModal;
    if (interaction.customId.startsWith("tipp_modal_")) return handleTippModal(interaction);
    if (interaction.customId.startsWith("wbi_modal_")) return werBinIch.handleModals(interaction);
    if (interaction.customId.startsWith("challenge:bet:")) return miniGames.handleChallengeModal(interaction);
    if (interaction.customId.startsWith("duell:modal:")) return miniGames.handleDuellModal(interaction);
  }

  // Select Menu Handler
  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    // Shard Merchant Select Menus
    if (interaction.customId === "shard_category_select" || interaction.customId === "shard_item_select_opshards" || interaction.customId === "shard_item_select_redcoins") {
      return shardMerchant.handleComponentInteraction(interaction);
    }
    // Market Select Menus
    if (interaction.customId === "market_category_select" || interaction.customId.startsWith("market_item_select_")) {
      return handleMarketInteraction(interaction);
    }
    // Auction Select Menus
    if (interaction.customId === "auction_category_select" || interaction.customId.startsWith("auction_item_select_")) {
      return auctionCommand.handleAuctionInteraction(interaction);
    }
    // FAQ Select Menus
    if (interaction.customId === "faq:category") {
      const categoryId = interaction.values[0];
      return handleFaqCategory(interaction, categoryId);
    }
    if (interaction.customId === "faq:question") {
      const questionId = interaction.values[0];
      return handleFaqQuestion(interaction, questionId);
    }
    if (interaction.customId === "faq:category:select") {
      const categoryId = interaction.values[0];
      return handleFaqCategory(interaction, categoryId);
    }
    if (interaction.customId === "faq:back" || interaction.customId === "faq:back:main") {
      return handleFaqCommand(interaction);
    }
    
    if (interaction.customId === "badge_display_select") return handleBadgeDisplaySelect(interaction);
    if (interaction.customId === "shop_type_select") return shop.handleShopTypeSelect(interaction);
    if (interaction.customId.startsWith("shop_category_select_")) return shop.handleShopCategorySelect(interaction);
    if (interaction.customId === "shop_item_select") return shop.handleShopItemSelect(interaction);
    if (interaction.customId === "spiel_select") return handleSpielSelect(interaction);
    if (interaction.customId === "rank_title_category") return handleRankTitleCategorySelect(interaction);
    if (interaction.customId === "rank_title_select") return handleRankTitleSelect(interaction);
    
    // Profilanpassungen System
    if (interaction.customId === "profile_customization_menu") return handleProfileCustomizationCategorySelect(interaction);
    if (interaction.customId === "title_action_menu") return handleTitleActionSelect(interaction);
    if (interaction.customId === "customization_title_category") return handleCustomizationTitleCategorySelect(interaction);
    if (interaction.customId === "customization_title_subcategory") return handleCustomizationTitleSubcategorySelect(interaction);
    if (interaction.customId === "customization_rank_title_select") return handleRankTitleSelect(interaction);
    if (interaction.customId === "profil_frame_category") return handleProfileShopCategorySelect(interaction);
    if (interaction.customId === "profil_frame_variant") return handleProfileFrameVariantSelect(interaction);
    if (interaction.customId === "profil_embedcolor_category") return handleEmbedColorCategorySelect(interaction);
    if (interaction.customId === "profil_embedcolor_variant") return handleEmbedColorVariantSelect(interaction);
    if (interaction.customId === "profil_embedcolor_activate") return handleEmbedColorActivateSelect(interaction);
    if (interaction.customId === "customization_frame_category_buy") return handleCustomizationCategorySelect(interaction);
    if (interaction.customId === "customization_frame_buy") {
      const frameId = interaction.values[0];
      return handleFramePurchaseCustomized(interaction, frameId);
    }
    if (interaction.customId === "customization_frame_select") {
      const frameId = interaction.values[0];
      return handleFrameSelectCustomized(interaction, frameId);
    }
    if (interaction.customId === "customization_badge_select") {
      const { loadJson, saveJson, DATA_DIR } = require("./jsonStorage");
      const profileFile = require("path").join(DATA_DIR, "profileCards.json");
      const profiles = loadJson(profileFile, {});
      const userId = interaction.user.id;
      profiles[userId] = profiles[userId] || {};
      profiles[userId].badges = Array.isArray(profiles[userId].badges) ? profiles[userId].badges : [];
      const selectedBadges = Array.isArray(interaction.values) ? interaction.values.filter(b => profiles[userId].badges.includes(b)) : [];
      profiles[userId].displayedBadges = selectedBadges;
      saveJson(profileFile, profiles);
      const badgeLines = profiles[userId].badges.map(b => {
        const selected = selectedBadges.includes(b);
        return `- **${b}** ${selected ? "✅ im Profil" : "❌ nicht im Profil"}`;
      }).join("\n");
      return interaction.update({
        content: `✅ Deine Badge-Auswahl wurde gespeichert.\n\n${badgeLines}`,
        components: [],
        flags: 64
      });
    }
  }
}


// ======================
// LOGIN
// ======================
client.login(process.env.TOKEN).catch(error => {
  logger.discordError(`[BOT_START] Login fehlgeschlagen: ${error.message}`, client);
  console.error(error);
});

client.on("guildMemberAdd", async member => {
  logger.discordInfo(`[USER] Joined: ${member.user.tag} (${member.id}) in ${member.guild.name}`, client);
  try { if (badges && typeof badges.syncBadgesForMember === "function") badges.syncBadgesForMember(member.guild.id, member, true); } catch (e) {}
  try { statsCache.updateStatsCacheForGuild(client, member.guild.id, member.guild.id === process.env.TEST_GUILD ? "test" : "main").catch(() => {}); } catch (e) {}

  // Wartende Karten-Bestellungen prüfen
  try { await kartenOrders.handleGuildMemberAdd(client, member); } catch (e) {}

  // Wartende Builder-Aufträge prüfen
  try { await builderOrders.handleGuildMemberAdd(client, member); } catch (e) {}

  // Profile-Willkommens-DM für Probebandit
  try { profileSystem.handleGuildMemberAdd(member); } catch (e) {}

  // Send welcome DM
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle("**Herzlich Willkommen bei den Hilfsbanditen!**")
      .setDescription(
        "Solltest du Interesse an unserem Clan haben, geh bitte zuerst in\n" +
        "<#1452706651269234906>\n" +
        "und klicke dort auf **Verifizieren**."
      )
      .setFooter({ text: "Willkommen im Team!" })
      .setTimestamp();

    member.user.send({ embeds: [welcomeEmbed] }).catch(() => {
      logger.discordInfo(`[WELCOME] Could not send welcome DM to ${member.user.tag}`, client);
    });
  } catch (err) {
    logger.discordError(`[WELCOME] Fehler beim Senden der Willkommensnachricht: ${err.message}`, client);
  }
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (badges && typeof badges.handleGuildMemberUpdate === "function") await badges.handleGuildMemberUpdate(newMember.guild.id, oldMember, newMember);
  } catch (e) {}

  // Profile-Willkommens-DM wenn Probebandit-Rolle vergeben wird
  try { await profileSystem.handleGuildMemberUpdate(oldMember, newMember); } catch (e) {}

  // Stats-Cache live aktualisieren bei Rollenänderung
  try { statsCache.updateStatsCacheForGuild(client, newMember.guild.id, newMember.guild.id === process.env.TEST_GUILD ? "test" : "main").catch(() => {}); } catch (e) {}

  // Check if user got the clan role (verified)
  try {
    const CLAN_ROLE_ID = "1346920870261690471";
    const hadClanRole = oldMember.roles.cache.has(CLAN_ROLE_ID);
    const hasClanRole = newMember.roles.cache.has(CLAN_ROLE_ID);

    if (!hadClanRole && hasClanRole) {
      // User just got verified
      const verifiedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle("**Vielen Dank, dass du dich verifiziert hast!**")
        .setDescription(
          "Wenn du dich für unseren Clan bewerben möchtest, geh bitte in\n" +
          "<#1452709916866511051>\n" +
          "und erstelle dort deine Bewerbung."
        )
        .setFooter({ text: "Viel Erfolg bei deiner Bewerbung!" })
        .setTimestamp();

      newMember.user.send({ embeds: [verifiedEmbed] }).catch(() => {
        logger.discordInfo(`[VERIFIED] Could not send verification DM to ${newMember.user.tag}`, client);
      });

      logger.discordInfo(`[VERIFIED] ${newMember.user.tag} (${newMember.id}) has been verified in ${newMember.guild.name}`, client);
    }
  } catch (err) {
    logger.discordError(`[VERIFIED] Fehler beim Senden der Verifizierungs-Nachricht: ${err.message}`, client);
  }

  // Check if user got the rules role (assigned by external verification bot)
  try {
    const RULES_ROLE_ID = "1351198142502273054";
    const hadRulesRole = oldMember.roles.cache.has(RULES_ROLE_ID);
    const hasRulesRole = newMember.roles.cache.has(RULES_ROLE_ID);

    if (!hadRulesRole && hasRulesRole) {
      const rulesEmbed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle("**Regeln bestätigt**")
        .setDescription("Danke, dass du die Regeln akzeptiert hast!\n Wir wünschen dir viel Spaß bei den Hilfsbanditen.\n\n Wenn du weitermachen möchtest, schau hier vorbei:\n <#1452709916866511051>\n Dort kannst du deine Bewerbung für unseren Clan erstellen.")
        .setTimestamp();

      newMember.user.send({ embeds: [rulesEmbed] }).catch(() => {
        logger.discordInfo(`[RULES] Could not send rules DM to ${newMember.user.tag}`, client);
      });

      logger.discordInfo(`[RULES] ${newMember.user.tag} (${newMember.id}) received rules role in ${newMember.guild.name}`, client);
    }
  } catch (err) {
    logger.discordError(`[RULES] Fehler beim Senden der Regeln-Nachricht: ${err.message}`, client);
  }
});

client.on("guildMemberRemove", member => {
  logger.discordInfo(`[USER] Left: ${member.user.tag} (${member.id}) aus ${member.guild.name}`, client);
  try { statsCache.updateStatsCacheForGuild(client, member.guild.id, member.guild.id === process.env.TEST_GUILD ? "test" : "main").catch(() => {}); } catch (e) {}
});

client.on("guildBanAdd", ban => {
  logger.discordInfo(`[USER] Gebannt: ${ban.user.tag} (${ban.user.id}) in ${ban.guild.name}`, client);
});

// ======================
// GUILD CREATE — Auto-Add für neue Server
// ======================
client.on("guildCreate", async (guild) => {
  logger.discordInfo(`[GUILD_JOIN] Bot wurde zu Guild hinzugefügt: ${guild.name} (${guild.id})`, client);

  // 1. Guild zur Whitelist hinzufügen
  const { addAllowedGuild } = require("./config");
  const wasAdded = addAllowedGuild(guild.id);

  // 2. Daten-Ordner erstellen + Migration (kopiere Default-Daten)
  try {
    const guildStorage = require("./guildStorage");
    const count = guildStorage.migrateToGuild(guild.id);
    logger.info(`[GUILD_JOIN] Daten-Migration für ${guild.name}: ${count} Dateien erstellt.`);
  } catch (e) {
    logger.error(`[GUILD_JOIN] Fehler bei Daten-Migration: ${e.message}`);
  }

  // 3. Slash-Commands registrieren
  try {
    const applicationId = process.env.CLIENT_ID || client.user?.id;
    if (applicationId) {
      await rest.put(
        Routes.applicationGuildCommands(applicationId, guild.id),
        { body: commands }
      );
      logger.info(`[GUILD_JOIN] Commands für ${guild.name} (${guild.id}) registriert.`);
    }
  } catch (error) {
    logger.error(`[GUILD_JOIN] Fehler beim Registrieren der Commands: ${error?.message || error}`);
  }

  // 4. Guild-Cache aktualisieren
  try {
    botStatus.updateGuildsCache(client);
    botStatus.updateGuildMembersCache(client);
  } catch (e) {}

  // 5. Owner-Login erstellen + DM mit Zugangsdaten senden
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner) {
      // Owner-Login über Dashboard-Server API erstellen (oder direkt via Datei)
      const path = require("path");
      const { loadJson, saveJsonSync } = require("./jsonStorage");
      const guildDir = path.join(__dirname, "..", "data", "guild_" + guild.id);
      const rolesFile = path.join(guildDir, "roles.json");
      const profilesFile = path.join(guildDir, "profiles.json");

      // roles.json: Owner-Rolle + User
      const rolesConfig = loadJson(rolesFile, { roles: {}, users: {} });
      if (!rolesConfig.roles) rolesConfig.roles = {};
      if (!rolesConfig.users) rolesConfig.users = {};
      if (!rolesConfig.roles.owner) {
        rolesConfig.roles.owner = {
          permissions: ["overview","coins","xp","zahlen","economy","userEdit","blacklist","weekly","shop","achievements","commands","dailyMissions","payHistory","voiceStats","xpConfig","roleManagement","dashboardAccess","maintenanceAccess","kartenSettings","kartenOrders","absenceManagement","probezeitManagement","dailyRewards","publicShop"]
        };
      }
      rolesConfig.users[owner.user.tag] = { role: "owner", userId: owner.id };
      saveJsonSync(rolesFile, rolesConfig);

      // profiles.json: Temporäres Passwort
      const profiles = loadJson(profilesFile, {});
      const existing = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === owner.user.tag.toLowerCase());
      if (!existing || !existing[1].password) {
        // Zufälliges Passwort generieren
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        let tempPwd = "";
        for (let i = 0; i < 12; i++) tempPwd += chars[Math.floor(Math.random() * chars.length)];

        if (existing) {
          profiles[existing[0]].password = tempPwd;
          profiles[existing[0]].firstLogin = true;
        } else {
          profiles[owner.id] = { discordName: owner.user.tag, password: tempPwd, firstLogin: true, createdAt: Date.now() };
        }
        saveJsonSync(profilesFile, profiles);

        // DM an Owner senden
        const { EmbedBuilder } = require("discord.js");
        const dashboardUrl = process.env.DASHBOARD_DOMAIN || `http://localhost:${process.env.DASHBOARD_PORT || 3002}`;
        const embed = new EmbedBuilder()
          .setTitle("Dashboard-Zugang eingerichtet")
          .setColor(0x2b2d31)
          .setDescription(`Hallo **${owner.user.username}**! Der Bot wurde auf deinem Server **${guild.name}** hinzugefügt.`)
          .addFields(
            { name: "Dashboard-URL", value: `${dashboardUrl}/dashboard/${guild.id}` },
            { name: "Benutzername", value: `\`${owner.user.tag}\`` },
            { name: "Passwort", value: `\`${tempPwd}\`` },
            { name: "Wichtig", value: "Du wirst beim ersten Login aufgefordert, dein Passwort zu ändern." }
          )
          .setFooter({ text: "DHBT Bot Dashboard" })
          .setTimestamp();

        await owner.send({ embeds: [embed] }).catch(() => {
          logger.warn(`[GUILD_JOIN] Konnte keine DM an Owner ${owner.user.tag} senden.`);
        });
        logger.info(`[GUILD_JOIN] Owner-Login für ${guild.name} erstellt: ${owner.user.tag}`);
      }
    }
  } catch (e) {
    logger.error(`[GUILD_JOIN] Fehler beim Erstellen des Owner-Logins: ${e.message}`);
  }
});


// ======================
// EVENT RANGLISTE – ZWEITES SYSTEM
// ======================

// Neue Tabelle erstellen (falls nicht vorhanden)
db.run(`
  CREATE TABLE IF NOT EXISTS event_punkte (
    userId TEXT PRIMARY KEY,
    username TEXT,
    points INTEGER DEFAULT 0
  )
`);

// Punkte hinzufügen
function addEventPoints(userId, username, amount) {
  db.run(
    `INSERT INTO event_punkte(userId, username, points)
     VALUES(?,?,?)
     ON CONFLICT(userId) DO UPDATE SET points = points + ?`,
    [userId, username, amount, amount]
  );
}

// Punkte entfernen
function removeEventPoints(userId, username, amount) {
  db.get(`SELECT points FROM event_punkte WHERE userId=?`, [userId], (err, row) => {
    const current = row ? row.points : 0;
    const newPoints = Math.max(0, current - amount);

    db.run(
      `INSERT INTO event_punkte(userId, username, points)
       VALUES(?,?,?)
       ON CONFLICT(userId) DO UPDATE SET points = ?`,
      [userId, username, newPoints, newPoints]
    );
  });
}

// Event-Rangliste anzeigen
function handleEventRanking(interaction) {
  db.all(`SELECT * FROM event_punkte ORDER BY points DESC`, (err, rows) => {
    if (!rows.length) {
      return interaction.reply({
        content: "Keine Event‑Punkte vorhanden.",
        flags: 64
      });
    }

    const lines = rows.map((r, i) =>
      `**${i + 1}. ${r.username}** — ${r.points} Punkte`
    );

    const embed = new EmbedBuilder()
      .setTitle("🏆 Event‑Rangliste")
      .setColor(0xf1c40f)
      .setDescription(lines.join("\n"))
      .setTimestamp();

    interaction.reply({ embeds: [embed] });
  });
}

// Slash-Command Handler
function handleEventPunkteCommand(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({
      content: "❌ Du hast keine Berechtigung, Event‑Punkte zu vergeben.",
      flags: 64
    });
  }

  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");

  if (amount <= 0) {
    return interaction.reply({
      content: "❌ Anzahl muss größer als 0 sein.",
      flags: 64
    });
  }

  if (sub === "add") {
    addEventPoints(user.id, user.username, amount);
    interaction.reply({
      content: `✨ **${amount} Event‑Punkte** an **${user.username}** vergeben.`,
      flags: 64
    });
  }

  if (sub === "remove") {
    removeEventPoints(user.id, user.username, amount);
    interaction.reply({
      content: `⚠️ **${amount} Event‑Punkte** von **${user.username}** entfernt.`,
      flags: 64
    });
  }
}

// Export hinzufügen
module.exports.handleEventPunkteCommand = handleEventPunkteCommand;
module.exports.handleEventRanking = handleEventRanking;


