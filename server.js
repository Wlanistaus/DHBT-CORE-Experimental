// ======================
// DHBT DASHBOARD SERVER
// ======================
require("dotenv").config({ path: require("path").join(__dirname, "..", "config", ".env") });
// Fallback for root .env
if (!process.env.TOKEN) require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { loadJson, saveJson, saveJsonSync, DATA_DIR, COINS_FILE, CONFIG_FILE } = require("../modules/jsonStorage");
const guildStorage = require("../modules/guildStorage");
const { getStats } = require("../modules/statsCache");
const profileSystem = require("../modules/profileSystem");
const botStatus = require("../modules/botStatus");
const absenceManager = require("../modules/absenceManager");
const boardConfig = require("../modules/boardConfig");
const probezeitSystem = require("../modules/probezeit");
const dailyRewards = require("../modules/dailyRewards");
const publicShop = require("../modules/publicShop");
const kartenOrders = require("../modules/kartenOrders");
const builderOrders = require("../modules/builderOrders");
const analytics = require("../modules/analytics");
const board = require("../modules/board");
const embedBuilder = require("../modules/embedBuilder");
const auctionApiClient = require("../modules/auctionApiClient");
const auctionNotifier = require("../modules/auctionNotifier");
const auctionCommand = require("../modules/auctionCommand");
const logSystem = require("../modules/logSystem");
const { EmbedBuilder } = require("discord.js");
const faqData = require("../modules/faqData");
const faqDiscord = require("../modules/faqDiscord");
const ticketSystem = require("../modules/tickets/ticketSystem");
const ticketDB = require("../modules/tickets/ticketDB");
const pollSystem = require("../modules/pollSystem");

// ============ OPSUCHT EVENT PORTAL (optional — nicht in Git enthalten) ============
let eventsPortal = null;
try {
  eventsPortal = require("../modules/eventsPortal");
} catch (e) {
  console.warn("[DASHBOARD] eventsPortal nicht gefunden — Event-Portal deaktiviert.");
}

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3001;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "dhbt2024";
const DASHBOARD_TITLE = process.env.DASHBOARD_TITLE || "DHBT Dashboard";
const DASHBOARD_DOMAIN = process.env.DASHBOARD_DOMAIN || "";
const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || "dhbt-secret-key-change-me";
const RM_API_KEY = process.env.RM_API_KEY || "PHAFTJ84FNz8r9vNRFpWG8vHP34SdP";
const RM_HOST = process.env.RM_HOST || "localhost";
const RM_PORT = parseInt(process.env.RM_PORT || "4000", 10);
const ROLES_FILE = path.join(__dirname, "roles.json");
const WEBSITE_LOCK_FILE = path.join(DATA_DIR, "websiteLock.json");
const THEME_CONFIG_FILE = path.join(DATA_DIR, "themeConfig.json");
const _cacheSalt = "nndsjroqbonubwbgzezu";

// ============ PRO-GUILD DATENSTRUKTUR ============
// Jede Guild bekommt einen eigenen Ordner: data/guild_<id>/
//   - config.json   (Admin-Passwort, Einstellungen)
//   - roles.json    (Rollen + User-Rollen-Zuweisungen für diese Guild)
//   - profiles.json (User-Profile für diese Guild)
const GUILD_DATA_DIR = (guildId) => path.join(DATA_DIR, "guild_" + guildId);
const GUILD_CONFIG_FILE = (guildId) => path.join(GUILD_DATA_DIR(guildId), "config.json");
const GUILD_ROLES_FILE = (guildId) => path.join(GUILD_DATA_DIR(guildId), "roles.json");
const GUILD_PROFILES_FILE = (guildId) => path.join(GUILD_DATA_DIR(guildId), "profiles.json");

function ensureGuildDataDir(guildId) {
  const dir = GUILD_DATA_DIR(guildId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getGuildConfig(guildId) {
  ensureGuildDataDir(guildId);
  const defaults = {
    adminPassword: null, // Pro-Guild Admin-Passwort (null = noch nicht gesetzt)
    title: "DHBT Dashboard",
    createdAt: Date.now(),
  };
  return loadJson(GUILD_CONFIG_FILE(guildId), defaults);
}

function saveGuildConfig(guildId, config) {
  ensureGuildDataDir(guildId);
  saveJsonSync(GUILD_CONFIG_FILE(guildId), config);
}

function getGuildRolesConfig(guildId) {
  ensureGuildDataDir(guildId);
  const config = loadJson(GUILD_ROLES_FILE(guildId), { roles: {}, users: {} });
  if (!config.users) config.users = {};
  if (!config.roles) config.roles = {};
  return config;
}

function saveGuildRolesConfig(guildId, data) {
  ensureGuildDataDir(guildId);
  saveJsonSync(GUILD_ROLES_FILE(guildId), data);
}

function getGuildUserRole(guildId, username) {
  if (!username) return null;
  const config = getGuildRolesConfig(guildId);
  const entry = config.users[username];
  if (!entry) return null;
  return typeof entry === 'string' ? entry : entry.role || null;
}

function getGuildRolePermissions(guildId, roleName) {
  const config = getGuildRolesConfig(guildId);
  return config.roles[roleName]?.permissions || [];
}

function hasGuildPermission(guildId, username, permission) {
  if (username === "admin") return true; // Globaler Master-Admin
  const role = getGuildUserRole(guildId, username);
  if (role === "owner") return true;
  if (!role) return false;
  const perms = getGuildRolePermissions(guildId, role);
  return perms.includes(permission);
}

// ============ GUILD OWNER LOGIN ============
// Erstellt automatisch einen Login für den Guild-Owner (Server-Admin)
// mit zufälligem Passwort, das beim ersten Login geändert werden muss
function generateRandomPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let pwd = "";
  for (let i = 0; i < length; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  return pwd;
}

// Erstellt oder aktualisiert den Owner-Login für eine Guild
// ownerUserId: Discord User ID des Server-Owners
// ownerUsername: Discord Name des Server-Owners
function ensureOwnerLogin(guildId, ownerUserId, ownerUsername) {
  if (!guildId || !ownerUserId || !ownerUsername) return null;
  ensureGuildDataDir(guildId);

  // 1. roles.json: Owner-Rolle + User-Eintrag
  const rolesConfig = getGuildRolesConfig(guildId);
  if (!rolesConfig.roles.owner) {
    rolesConfig.roles.owner = {
      permissions: ["overview","coins","xp","zahlen","economy","userEdit","blacklist","weekly","shop","achievements","commands","dailyMissions","payHistory","voiceStats","xpConfig","roleManagement","dashboardAccess","maintenanceAccess","kartenSettings","kartenOrders","absenceManagement","probezeitManagement","dailyRewards","publicShop"]
    };
  }
  const existingUser = rolesConfig.users[ownerUsername];
  if (!existingUser) {
    rolesConfig.users[ownerUsername] = { role: "owner", userId: ownerUserId };
  } else if (typeof existingUser === 'string') {
    rolesConfig.users[ownerUsername] = { role: "owner", userId: ownerUserId };
  } else if (!existingUser.userId) {
    existingUser.userId = ownerUserId;
  }
  saveGuildRolesConfig(guildId, rolesConfig);

  // 2. profiles.json: Passwort-Eintrag (wenn noch nicht vorhanden)
  const profilesFile = GUILD_PROFILES_FILE(guildId);
  let profiles = {};
  if (fs.existsSync(profilesFile)) {
    profiles = loadJson(profilesFile, {});
  }
  // Prüfe ob User bereits ein Passwort hat
  const existing = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === ownerUsername.toLowerCase());
  if (existing && existing[1].password) {
    // Hat bereits ein Passwort — nichts ändern
    return { created: false, username: ownerUsername };
  }
  // Neues Passwort generieren
  const tempPassword = generateRandomPassword();
  if (existing) {
    // User existiert aber ohne Passwort
    profiles[existing[0]].password = tempPassword;
    profiles[existing[0]].firstLogin = true;
  } else {
    // Neuer User
    profiles[ownerUserId] = {
      discordName: ownerUsername,
      password: tempPassword,
      firstLogin: true,
      createdAt: Date.now()
    };
  }
  saveJsonSync(profilesFile, profiles);

  return { created: true, username: ownerUsername, password: tempPassword };
}

// ============ WEBSITE LOCK HELPER ============
let _siteLockCache = null;
let _siteLockCacheTs = 0; // cache invalidated on every restart

function getSiteLockConfig() {
  const now = Date.now();
  if (_siteLockCache && now - _siteLockCacheTs < 1000) return _siteLockCache;
  _siteLockCache = loadJson(WEBSITE_LOCK_FILE, {
    enabled: false,
    reason: "",
    allowedPages: ["/dashboard", "/impressum", "/datenschutz", "/nutzungsbedingungen"],
    blockedPages: ["/", "/profile", "/status"]
  });
  _siteLockCacheTs = now;
  return _siteLockCache;
}

function saveSiteLockConfig(config) {
  saveJsonSync(WEBSITE_LOCK_FILE, config);
  _siteLockCache = config;
  _siteLockCacheTs = Date.now();
}

// ============ THEME CONFIG HELPER ============
let _themeConfigCache = null;
let _themeConfigCacheTs = 0;

function discoverThemes() {
  const themes = ["standard"];
  const themesDir = path.join(__dirname, "public", "themes");
  try {
    fs.readdirSync(themesDir).forEach(f => {
      if (f === "standard") return;
      const full = path.join(themesDir, f);
      if (fs.statSync(full).isDirectory()) themes.push(f);
    });
  } catch (e) {}
  return themes;
}

const ALLOWED_THEMES = discoverThemes();

function getThemeConfig() {
  const now = Date.now();
  if (_themeConfigCache && now - _themeConfigCacheTs < 1000) return _themeConfigCache;
  _themeConfigCache = loadJson(THEME_CONFIG_FILE, { activeTheme: "standard" });
  _themeConfigCacheTs = now;
  return _themeConfigCache;
}

function saveThemeConfig(config) {
  saveJsonSync(THEME_CONFIG_FILE, config);
  _themeConfigCache = config;
  _themeConfigCacheTs = Date.now();
}

function isPageRequest(req) {
  if (req.path.startsWith("/api/")) return false;
  if (req.path.startsWith("/images/")) return false;
  if (req.path.match(/\.[^/]+$/)) return false;
  return true;
}

function normalizeLockPath(p) {
  if (!p || p === "/") return "/";
  return p.replace(/\/+$/, "");
}

function setSessionDuration(req, rememberMe) {
  if (!req.session) return;
  const ms = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  req.session.cookie.maxAge = ms;
}

function isPageAllowed(req, config) {
  const p = normalizeLockPath(req.path);
  const allowed = (config.allowedPages || []).map(normalizeLockPath);
  const blocked = (config.blockedPages || []).map(normalizeLockPath);
  // Always allow explicitly allowed pages (e.g. /dashboard)
  if (allowed.includes(p)) return true;
  // Block explicitly blocked pages (exact match or prefix for /events)
  for (const b of blocked) {
    if (p === b) return false;
    if (b === "/events" && (p === "/events" || p.startsWith("/events/"))) return false;
  }
  // Everything else: allow (only listed pages are locked)
  return true;
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Trust Proxy für Reverse-Proxy (nginx, Cloudflare, etc.)
app.set("trust proxy", 1);

app.use(session({
  secret: DASHBOARD_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, secure: "auto", httpOnly: true, sameSite: "lax" },
  name: "dhbt_dashboard.sid"
}));

// Website Lock Middleware
app.use((req, res, next) => {
  const config = getSiteLockConfig();
  if (!config.enabled) return next();
  if (!isPageRequest(req)) return next();
  // /home and /Wartung are always reachable — /Wartung is the standalone maintenance page
  if (req.path === "/home" || req.path === "/Wartung") return next();
  if (req.session && req.session.loggedIn) return next();
  if (req.session && req.session.maintenanceBypass) return next();
  if (isPageAllowed(req, config)) return next();
  return res.redirect("/Wartung");
});

// Restart Manager – Einzelseiten Offline-Middleware
const OFFLINE_PAGES_FILE = path.join(DATA_DIR, "offlinePages.json");
let _offlinePagesCache = null;
let _offlinePagesCacheTs = 0;
function getOfflinePagesConfig() {
  const now = Date.now();
  if (_offlinePagesCache && now - _offlinePagesCacheTs < 5000) return _offlinePagesCache;
  try {
    _offlinePagesCache = JSON.parse(fs.readFileSync(OFFLINE_PAGES_FILE, "utf8"));
  } catch {
    _offlinePagesCache = { globalOffline: false, pages: {} };
  }
  _offlinePagesCacheTs = now;
  return _offlinePagesCache;
}
const PAGE_PATH_TO_OFFLINE_URL = {
  "/":        "/offline/home",
  "/profile": "/offline/profile",
  "/karten":  "/offline/karten",
  "/builder": "/offline/builder",
  "/status":  "/offline/status",
};
const RM_STATUS_PORT = 4001;
const PAGE_ID_MAP = { home:"/", profile:"/profile", karten:"/karten", builder:"/builder", status:"/status" };
const PAGE_PATH_TO_ID = { "/":"home", "/profile":"profile", "/karten":"karten", "/builder":"builder", "/status":"status" };
app.use((req, res, next) => {
  if (!isPageRequest(req)) return next();
  const cfg = getOfflinePagesConfig();
  if (!cfg) return next();
  const p = normalizeLockPath(req.path) || "/";
  const pageId = PAGE_PATH_TO_ID[p];
  if (!pageId) return next();
  const rmOfflineUrl = `http://${req.hostname}:${RM_STATUS_PORT}/offline/${pageId}`;
  if (cfg.globalOffline) return res.redirect(rmOfflineUrl);
  if (cfg.pages?.[pageId]?.offline) return res.redirect(rmOfflineUrl);
  next();
});

// Analytics Tracking: Nur echte Seitenaufrufe (keine Assets/APIs), nur bei Cookie-Consent
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (!isPageRequest(req)) return next();
  const consent = req.headers.cookie?.match(/(?:^|; )cookie_consent=([^;]*)/);
  if (consent && decodeURIComponent(consent[1]) === "accepted") {
    analytics.trackPageView(req, res);
  }
  next();
});

// Hauptseite — muss VOR express.static stehen
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home", "index.html"));
});

app.get("/faq", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "faq", "index.html"));
});
app.get("/mitglieder", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mitglieder", "index.html"));
});
// / = sofortiger Redirect auf /home, leer, kein Content
app.get("/", (req, res) => {
  return res.redirect(302, "/home");
});

// /Wartung = eigenständige Wartungsseite
app.get("/Wartung", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "Wartung", "index.html"));
});

// Board & Embed – protected routes MUST be before generic express.static
function requirePagePermission(permission) {
  return (req, res, next) => {
    const loggedIn = !!(req.session && req.session.loggedIn);
    const isPage = isPageRequest(req);
    if (!loggedIn) {
      if (isPage) return res.redirect("/dashboard");
      return res.status(401).json({ error: "Nicht eingeloggt" });
    }
    const username = req.session.username || "admin";
    if (!hasPermission(username, permission)) {
      if (isPage) return res.redirect("/dashboard?error=no_permission");
      return res.status(403).json({ error: "Keine Berechtigung" });
    }
    next();
  };
}

app.use("/board", requirePagePermission("dhbt-board_access"), express.static(path.join(__dirname, "public", "board")));
app.use("/embed", requirePagePermission("dhbt-embed_builder"), express.static(path.join(__dirname, "public", "embed")));
app.get("/board/*", requirePagePermission("dhbt-board_access"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "board", "index.html"));
});
app.get("/embed/*", requirePagePermission("dhbt-embed_builder"), (req, res) => {
  res.sendFile(path.join(__dirname, "public", "embed", "index.html"));
});

// Block any remaining /board or /embed requests that bypass above (e.g. static assets not found)
app.use((req, res, next) => {
  if (req.path === "/board" || req.path.startsWith("/board/") ||
      req.path === "/embed" || req.path.startsWith("/embed/")) {
    if (!req.session || !req.session.loggedIn) return res.redirect("/dashboard");
  }
  next();
});

// ============ DASHBOARD ROUTING (per-Guild URLs) ============
// /dashboard           → Guild-Auswahl-Seite
// /dashboard/:guildId  → Dashboard für diese Guild (Login + App)
const DASHBOARD_HTML = path.join(__dirname, "public", "dashboard", "index.html");

app.get("/dashboard", (req, res) => {
  // Wenn bereits eingeloggt mit Guild → direkt zum Dashboard dieser Guild
  if (req.session && req.session.loggedIn && req.session.guildId) {
    return res.redirect(`/dashboard/${req.session.guildId}`);
  }
  // Sonst: Login + Guild-Auswahl-Seite
  res.sendFile(path.join(__dirname, "public", "dashboard", "guild-select.html"));
});

app.get("/dashboard/:guildId", (req, res) => {
  const { guildId } = req.params;
  const { ALLOWED_GUILDS } = require("../modules/config");
  let validGuild = ALLOWED_GUILDS.includes(guildId);
  if (!validGuild) {
    const guildsCache = botStatus.getGuildsCache();
    validGuild = guildsCache.some(g => g.id === guildId);
  }
  if (!validGuild) {
    return res.status(404).send("Guild nicht gefunden");
  }
  // Wenn eingeloggt aber für eine ANDERE Guild → ausloggen und neu einloggen
  if (req.session && req.session.loggedIn && req.session.guildId && req.session.guildId !== guildId) {
    req.session.destroy(() => {});
  }
  res.sendFile(DASHBOARD_HTML);
});

// Static files für /dashboard/ (z.B. CSS, JS) — aber nicht die Routes oben überschreiben
app.use("/dashboard", express.static(path.join(__dirname, "public", "dashboard"), {
  index: false, // index.html wird oben explizit gesendet
  etag: false,
  lastModified: false,
}));

app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// ============ EASTEREGG: Lightmode ============
const EASTREEGG_FILE = path.join(DATA_DIR, "easteregg.json");
const crypto = require("crypto");

function loadEasterEggData() {
  return loadJson(EASTREEGG_FILE, { count: 0, visitorIds: [], userRewards: {} });
}

function saveEasterEggData(data) {
  saveJsonSync(EASTREEGG_FILE, data);
}

function getOrCreateVisitorId(req) {
  let visitorId = null;
  // Check cookie
  if (req.headers.cookie) {
    const m = req.headers.cookie.match(/(?:^|; )dhbt_easteregg_vid=([^;]+)/);
    if (m) visitorId = m[1];
  }
  if (!visitorId) {
    visitorId = crypto.randomBytes(16).toString("hex");
  }
  return visitorId;
}

function setVisitorCookie(res, visitorId) {
  res.setHeader("Set-Cookie", `dhbt_easteregg_vid=${visitorId}; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax; HttpOnly`);
}

app.get("/api/easteregg/counter", (req, res) => {
  try {
    const data = loadEasterEggData();
    res.json({ count: data.count || 0 });
  } catch (e) {
    res.json({ count: 0 });
  }
});

app.post("/api/easteregg/complete", (req, res) => {
  try {
    const data = loadEasterEggData();
    const visitorId = getOrCreateVisitorId(req);
    setVisitorCookie(res, visitorId);

    // Increment global counter only if this visitor hasn't been counted
    let counted = false;
    if (!data.visitorIds || !data.visitorIds.includes(visitorId)) {
      data.visitorIds = data.visitorIds || [];
      data.visitorIds.push(visitorId);
      // Cap visitor IDs to prevent unbounded growth
      if (data.visitorIds.length > 100000) data.visitorIds = data.visitorIds.slice(-50000);
      data.count = (data.count || 0) + 1;
      counted = true;
    }

    // Check if user is logged in
    const loggedIn = !!(req.session && req.session.loggedIn);
    let achievementUnlocked = false;
    let badgeUnlocked = false;
    let titleUnlocked = false;

    if (loggedIn) {
      const username = req.session.username || "admin";
      let discordId = null;

      if (username === "admin") {
        discordId = "admin";
      } else {
        // Search profiles.json for discordName match (same as login logic)
        try {
          const profiles = profileSystem.loadProfiles(req.session?.guildId);
          for (const [id, profile] of Object.entries(profiles)) {
            if ((profile.discordName || "").toLowerCase() === username.toLowerCase()) {
              discordId = id;
              break;
            }
          }
        } catch (e) { console.error("[EASTEREGG] Profile load error:", e.message); }
      }

      console.log(`[EASTEREGG] User: ${username}, discordId: ${discordId}, loggedIn: ${loggedIn}`);

      if (discordId) {
        data.userRewards = data.userRewards || {};
        if (!data.userRewards[discordId]) {
          data.userRewards[discordId] = { completedAt: Date.now() };
          achievementUnlocked = true;
          badgeUnlocked = true;
          titleUnlocked = true;

          // Award achievement via existing system
          try {
            const achievements = require("../modules/achievements");
            if (!achievements.hasAchievement(discordId, "easteregg_lightmode")) {
              achievements.unlockAchievement(discordId, "easteregg_lightmode");
              console.log("[EASTEREGG] Achievement unlocked for", discordId);
            }
          } catch (e) { console.error("[EASTEREGG] Achievement error:", e.message); }

          // Award badge + title in profileCards.json (per-Guild)
          try {
            const profData = loadGuildJson(req, "profileCards.json", {});
            profData[discordId] = profData[discordId] || {};
            profData[discordId].badges = profData[discordId].badges || [];
            if (!profData[discordId].badges.includes("lightmode_easteregg")) {
              profData[discordId].badges.push("lightmode_easteregg");
              console.log("[EASTEREGG] Badge added for", discordId);
            }
            // Award title
            profData[discordId].selectedRankTitle = "🌑 Hüter der Dunkelheit";
            profData[discordId].rankTitleEnabled = true;
            profData[discordId].achievementTitles = profData[discordId].achievementTitles || [];
            if (!profData[discordId].achievementTitles.includes("🌑 Hüter der Dunkelheit")) {
              profData[discordId].achievementTitles.push("🌑 Hüter der Dunkelheit");
              console.log("[EASTEREGG] Title added for", discordId);
            }
            saveGuildJsonSync(req, "profileCards.json", profData);
          } catch (e) { console.error("[EASTEREGG] Badge/Title error:", e.message); }
        } else {
          console.log("[EASTEREGG] User already rewarded:", discordId);
        }
      }
    }

    saveEasterEggData(data);

    res.json({
      count: data.count || 0,
      counted,
      achievementUnlocked,
      badgeUnlocked,
      titleUnlocked,
    });
  } catch (e) {
    res.status(500).json({ error: e.message, count: 0 });
  }
});

// ============ MARKET CONFIG ============
const marketCommand = require("../modules/marketCommand");
const shardMerchant = require("../modules/shardMerchant");

app.get("/api/market/config", (req, res) => {
  try {
    const cfg = marketCommand.loadMarketConfig();
    res.json(cfg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/market/config/channel", (req, res) => {
  try {
    const { channelId } = req.body;
    const cfg = marketCommand.loadMarketConfig();
    cfg.channelId = channelId || null;
    if (!channelId) cfg.messageId = null;
    marketCommand.saveMarketConfig(cfg);
    res.json({ success: true, channelId: cfg.channelId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/market/send", async (req, res) => {
  try {
    const cfg = marketCommand.loadMarketConfig();
    if (!cfg.channelId) return res.status(400).json({ error: "Kein Channel konfiguriert" });

    const prices = await marketCommand.fetchPricesForDashboard();
    const processed = marketCommand.processMarketDataForDashboard(prices);
    const embedData = marketCommand.buildMainEmbedData(processed);
    const payload = {
      embeds: [embedData],
      components: [{
        type: 1,
        components: [{
          type: 2,
          custom_id: "market_open",
          label: "Markt öffnen",
          style: 1,
          emoji: { name: "🛒" },
        }],
      }],
    };

    const client = botStatus.getClient ? botStatus.getClient() : null;
    let posted = false;
    let sendError = null;
    let messageId = cfg.messageId;

    if (client) {
      try {
        console.log(`[MARKET] Sending via bot client to channel ${cfg.channelId}, guilds: ${client.guilds.cache.size}`);
        const result = await marketCommand.sendOrUpdateMarketEmbed(client);
        return res.json({ success: true, ...result });
      } catch (e) {
        sendError = e.message;
        console.error("[MARKET] Bot client send failed:", e.message);
      }
    }

    if (!posted) {
      const { MAIN_GUILD, TEST_GUILD, getBotToken } = boardConfig;
      for (const gid of [MAIN_GUILD, TEST_GUILD]) {
        const token = getBotToken(gid);
        if (!token) continue;
        try {
          if (messageId) {
            await embedBuilder.discordApiRequest(token, "PATCH", `/channels/${cfg.channelId}/messages/${messageId}`, payload);
            posted = true;
          } else {
            const response = await embedBuilder.discordApiRequest(token, "POST", `/channels/${cfg.channelId}/messages`, payload);
            messageId = response.id;
            cfg.messageId = messageId;
            marketCommand.saveMarketConfig(cfg);
            posted = true;
          }
          break;
        } catch (e) {
          sendError = e.message;
        }
      }
    }

    if (!posted) {
      return res.status(500).json({ error: `Market-Embed konnte nicht gesendet werden: ${sendError || "Bot nicht verbunden und kein Token verfügbar"}` });
    }

    res.json({ success: true, updated: !!cfg.messageId, messageId });
  } catch (e) {
    console.error("[MARKET] Send error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ SHARD MERCHANT CONFIG ============

app.get("/api/shard/config", (req, res) => {
  try {
    const cfg = shardMerchant.loadConfig();
    res.json({
      channelId: cfg.channelId || null,
      messageId: cfg.messageId || null,
      lastUpdate: cfg.lastUpdate || null
    });
  } catch (e) {
    console.error("[SHARD] Config get error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/shard/config/channel", async (req, res) => {
  try {
    const { channelId } = req.body || {};
    const cfg = shardMerchant.loadConfig();
    cfg.channelId = channelId || null;
    if (!channelId) cfg.messageId = null;
    shardMerchant.saveConfig(cfg);
    res.json({ success: true, channelId: cfg.channelId });
  } catch (e) {
    console.error("[SHARD] Config channel error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/shard/send", async (req, res) => {
  try {
    const cfg = shardMerchant.loadConfig();
    if (!cfg.channelId) {
      return res.status(400).json({ error: "Kein Channel konfiguriert" });
    }

    const client = botStatus.getClient ? botStatus.getClient() : null;
    let result;
    let sendError = null;

    if (client) {
      try {
        result = await shardMerchant.sendOrUpdateLiveEmbed(client);
      } catch (e) {
        sendError = e.message;
        console.error("[SHARD] Bot client send failed:", e.message);
      }
    }

    // Fallback: sende direkt über Discord-HTTP-API mit gespeichertem Bot-Token
    if (!result) {
      let posted = false;
      let messageId = cfg.messageId;
      const items = await shardMerchant.getItems();
      const payload = shardMerchant.buildLiveEmbed(items);

      const { MAIN_GUILD, TEST_GUILD, getBotToken } = boardConfig;
      for (const gid of [MAIN_GUILD, TEST_GUILD]) {
        const token = getBotToken(gid);
        if (!token) continue;
        try {
          if (messageId) {
            await embedBuilder.discordApiRequest(token, "PATCH", `/channels/${cfg.channelId}/messages/${messageId}`, payload);
            posted = true;
          } else {
            const response = await embedBuilder.discordApiRequest(token, "POST", `/channels/${cfg.channelId}/messages`, payload);
            messageId = response.id;
            cfg.messageId = messageId;
            shardMerchant.saveConfig(cfg);
            posted = true;
          }
          result = { updated: !!messageId, posted: !messageId, messageId, channelId: cfg.channelId };
          console.log(`[SHARD] Sent/Updated via HTTP API for guild ${gid}`);
          break;
        } catch (e) {
          sendError = e.message;
          console.error(`[SHARD] HTTP API fallback failed for guild ${gid}:`, e.message);
        }
      }

      if (!posted) {
        return res.status(500).json({ error: `Shards-Live-Embed konnte nicht gesendet werden: ${sendError || "Bot nicht verbunden und kein Token verfügbar"}` });
      }
    }

    res.json({ success: true, ...result });
  } catch (e) {
    console.error("[SHARD] Send error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ AUCTION LIVE EMBED CONFIG ============

app.get("/api/auction/live/config", (req, res) => {
  try {
    const cfg = auctionCommand.loadAuctionConfig();
    res.json({ channelId: cfg.channelId || null, messageId: cfg.messageId || null });
  } catch (e) {
    console.error("[AUCTION] Config get error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auction/live/config/channel", (req, res) => {
  try {
    const { channelId } = req.body || {};
    const cfg = auctionCommand.loadAuctionConfig();
    cfg.channelId = channelId || null;
    if (!channelId) cfg.messageId = null;
    auctionCommand.saveAuctionConfig(cfg);
    res.json({ success: true, channelId: cfg.channelId });
  } catch (e) {
    console.error("[AUCTION] Config channel error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/auction/live/send", async (req, res) => {
  try {
    const cfg = auctionCommand.loadAuctionConfig();
    if (!cfg.channelId) return res.status(400).json({ error: "Kein Channel konfiguriert" });

    const [active, categories] = await Promise.all([auctionCommand.fetchAuctionsForDashboard(), auctionCommand.fetchCategoriesForDashboard()]);
    const processed = auctionCommand.processAuctionData(active, categories);
    const embedData = auctionCommand.buildMainEmbedData(processed);
    const payload = {
      embeds: [embedData],
      components: [{
        type: 1,
        components: [{
          type: 2,
          custom_id: "auction_open",
          label: "Auktionen öffnen",
          style: 1,
          emoji: { name: "🔨" }
        }]
      }]
    };

    const client = botStatus.getClient ? botStatus.getClient() : null;
    let posted = false;
    let sendError = null;
    let messageId = cfg.messageId;

    if (client) {
      try {
        const result = await auctionCommand.sendOrUpdateAuctionEmbed(client);
        return res.json({ success: true, ...result });
      } catch (e) {
        sendError = e.message;
        console.error("[AUCTION] Bot client send failed:", e.message);
      }
    }

    if (!posted) {
      const { MAIN_GUILD, TEST_GUILD, getBotToken } = boardConfig;
      for (const gid of [MAIN_GUILD, TEST_GUILD]) {
        const token = getBotToken(gid);
        if (!token) continue;
        try {
          if (messageId) {
            await embedBuilder.discordApiRequest(token, "PATCH", `/channels/${cfg.channelId}/messages/${messageId}`, payload);
            posted = true;
          } else {
            const response = await embedBuilder.discordApiRequest(token, "POST", `/channels/${cfg.channelId}/messages`, payload);
            messageId = response.id;
            cfg.messageId = messageId;
            auctionCommand.saveAuctionConfig(cfg);
            posted = true;
          }
          break;
        } catch (e) {
          sendError = e.message;
        }
      }
    }

    if (!posted) {
      return res.status(500).json({ error: `Auktions-Live-Embed konnte nicht gesendet werden: ${sendError || "Bot nicht verbunden und kein Token verfügbar"}` });
    }

    res.json({ success: true, updated: !!cfg.messageId, messageId, channelId: cfg.channelId });
  } catch (e) {
    console.error("[AUCTION] Live send error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============ SERVER EVENT LOG CONFIG ============

app.get("/api/log-system/config", (req, res) => {
  try {
    const guildId = req.session.guildId;
    const cfg = logSystem.loadConfig(guildId);
    res.json({ channelId: cfg.channelId || null });
  } catch (e) {
    console.error("[LOG-SYSTEM] Config get error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/log-system/config/channel", (req, res) => {
  try {
    const guildId = req.session.guildId;
    const { channelId } = req.body || {};
    logSystem.setChannelId(guildId, channelId || null);
    res.json({ success: true, channelId: logSystem.getChannelId(guildId) });
  } catch (e) {
    console.error("[LOG-SYSTEM] Config channel error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Karten React-App (muss vorher mit npm run build gebaut werden)
const kartenBuildPath = path.join(__dirname, "public", "karten", "build");
app.use("/karten", express.static(kartenBuildPath));
app.get("/karten", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(kartenBuildPath, "index.html"));
});
app.get("/karten/*", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(kartenBuildPath, "index.html"));
});

// Builder-Auftragssystem
app.use("/builder", express.static(path.join(__dirname, "public", "builder")));
app.get("/builder/*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "builder", "index.html"));
});

// ============ OPSUCHT EVENT PORTAL ============
// Mount the event portal as a standalone module under /events (nur wenn verfügbar)
if (eventsPortal) {
  app.use("/events", eventsPortal.router);
  eventsPortal.init().catch(err => console.error("[EVENTS PORTAL] Init error:", err.message));
} else {
  // Fallback: /events leitet auf eine Hinweis-Seite
  app.get("/events", (req, res) => {
    res.status(503).send("Event-Portal ist auf diesem Server nicht verfügbar.");
  });
}

// ============ ROLLEN HELPER ============
function getRolesConfig() {
  const config = loadJson(ROLES_FILE, { roles: {}, users: {} });
  if (!config.users) config.users = {};
  return config;
}

function saveRolesConfig(data) {
  saveJsonSync(ROLES_FILE, data);
}

function getUserRole(username) {
  if (!username) return null;
  const config = getRolesConfig();
  const entry = config.users[username];
  if (!entry) return null;
  return typeof entry === 'string' ? entry : entry.role || null;
}

function getRolePermissions(roleName) {
  const config = getRolesConfig();
  return config.roles[roleName]?.permissions || [];
}

function hasPermission(username, permission) {
  if (username === "admin") return true; // Master-Admin hat immer alle Rechte
  const role = getUserRole(username);
  if (role === "owner") return true; // Owner hat immer alle Rechte
  if (!role) return false;
  const perms = getRolePermissions(role);
  return perms.includes(permission);
}

// ============ AUTH MIDDLEWARE ============
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: "Nicht eingeloggt" });
}

// Helper: Guild-spezifischen Dateipfad holen (aus Session)
// Lädt aus data/guild_<id>/<fileName>, mit Fallback auf globale data/<fileName>
function guildFile(req, fileName) {
  const guildId = req.session?.guildId;
  if (!guildId) return path.join(DATA_DIR, fileName);
  return guildStorage.guildFilePath(guildId, fileName);
}

// Helper: Guild-spezifische JSON-Datei laden
function loadGuildJson(req, fileName, defaultValue = {}) {
  const guildId = req.session?.guildId;
  if (!guildId) return loadJson(path.join(DATA_DIR, fileName), defaultValue);
  return guildStorage.loadGuildJson(guildId, fileName, defaultValue);
}

// Helper: Guild-spezifische JSON-Datei speichern
function saveGuildJsonSync(req, fileName, data) {
  const guildId = req.session?.guildId;
  if (!guildId) return saveJsonSync(path.join(DATA_DIR, fileName), data);
  guildStorage.saveGuildJsonSync(guildId, fileName, data);
}

// Middleware: Stellt sicher, dass eine Guild ausgewählt wurde
function requireGuild(req, res, next) {
  if (!req.session || !req.session.loggedIn) return res.status(401).json({ error: "Nicht eingeloggt" });
  if (!req.session.guildId) return res.status(403).json({ error: "Keine Guild ausgewählt", needsGuildSelection: true });
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.session || !req.session.loggedIn) return res.status(401).json({ error: "Nicht eingeloggt" });
    const username = req.session.username || "admin";
    const guildId = req.session.guildId;
    if (!guildId) return res.status(403).json({ error: "Keine Guild ausgewählt" });
    if (!hasGuildPermission(guildId, username, permission)) return res.status(403).json({ error: "Keine Berechtigung" });
    next();
  };
}

// ============ AUCTIONS & EXTERNAL STATUS APIS ============
const AUCTION_NOTIFIER_FILE = path.join(DATA_DIR, "auctionNotifier.json");
const MARKET_API_URL = "https://api.opsucht.net/market/prices";
const SHARD_API_URL = "https://api.opsucht.net/merchant/rates";

function checkApi(url, timeoutMs = 10000) {
  return new Promise(resolve => {
    const start = Date.now();
    const req = https.get(url, { timeout: timeoutMs }, res => {
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      resolve({ ok, status: res.statusCode, responseTime: Date.now() - start });
    });
    req.on("error", () => resolve({ ok: false, status: 0, responseTime: Date.now() - start }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, responseTime: timeoutMs }); });
    req.setTimeout(timeoutMs);
  });
}

app.get("/api/external-status", (req, res) => {
  const auctionPromise = (async () => {
    const start = Date.now();
    try {
      const auctions = await auctionApiClient.getActiveAuctions();
      return { id: "opsucht_auctions", name: "🔨 OPSUCHT Auktionshaus", url: "https://api.opsucht.net/auctions", status: "online", responseTime: Date.now() - start, httpStatus: 200, lastChecked: new Date().toISOString(), extra: { activeAuctions: Array.isArray(auctions) ? auctions.length : null } };
    } catch (e) {
      return { id: "opsucht_auctions", name: "🔨 OPSUCHT Auktionshaus", url: "https://api.opsucht.net/auctions", status: "offline", responseTime: 0, httpStatus: 0, lastChecked: new Date().toISOString(), offlineReason: e.message };
    }
  })();
  const marketPromise = checkApi(MARKET_API_URL).then(r => ({
    id: "opsucht_market", name: "🛒 OPSUCHT Markt", url: MARKET_API_URL,
    status: r.ok ? "online" : "offline", responseTime: r.responseTime, httpStatus: r.status,
    lastChecked: new Date().toISOString(), offlineReason: r.ok ? undefined : `HTTP ${r.status}`
  }));
  const shardPromise = checkApi(SHARD_API_URL).then(r => ({
    id: "opsucht_shard", name: "💠 OPSUCHT Shard", url: SHARD_API_URL,
    status: r.ok ? "online" : "offline", responseTime: r.responseTime, httpStatus: r.status,
    lastChecked: new Date().toISOString(), offlineReason: r.ok ? undefined : `HTTP ${r.status}`
  }));
  Promise.all([auctionPromise, marketPromise, shardPromise]).then(services => res.json({ services }));
});

app.get("/api/auction/stats", requirePermission("roleManagement"), (req, res) => {
  const state = loadJson(AUCTION_NOTIFIER_FILE, { stats: {}, lastAuctions: {}, userSettings: {}, processedEvents: {} });
  const userCount = Object.keys(state.userSettings || {}).length;
  const enabledCount = Object.values(state.userSettings || {}).filter(s => s.bid_on_own || s.own_auction_ended || s.outbid || s.won).length;
  res.json({
    stats: state.stats || {},
    activeAuctions: Object.keys(state.lastAuctions || {}).length,
    enabledUsers: enabledCount,
    totalUsers: userCount,
    lastError: state.stats?.lastError || null
  });
});

app.get("/api/auction/test-api", requirePermission("roleManagement"), async (req, res) => {
  try {
    const start = Date.now();
    const [auctions, categories] = await Promise.all([auctionApiClient.getActiveAuctions(), auctionApiClient.getCategories()]);
    res.json({
      success: true,
      status: "online",
      http: 200,
      responseTime: Date.now() - start,
      activeAuctions: auctions.length,
      categories: categories.length
    });
  } catch (e) {
    res.status(500).json({ success: false, status: "offline", error: e.message });
  }
});

function buildTestEmbed(type, data) {
  const base = new EmbedBuilder().setColor(0xF59E0B).setTitle("🧪 TEST – Auktions-Benachrichtigung").setDescription("Dies ist eine Testbenachrichtigung.");
  if (type === "bid_on_own") base.addFields(
    { name: "🔨 Neues Gebot auf deine Auktion", value: data.item || "Diamantschwert" },
    { name: "Bieter", value: data.bidder || "Player123", inline: true },
    { name: "Neues Gebot", value: `$${(data.bid || 125000).toLocaleString("de-DE")}`, inline: true },
    { name: "Verbleibend", value: data.time || "12 Minuten", inline: true }
  );
  else if (type === "own_auction_ended") base.addFields(
    { name: "🏁 Deine Auktion ist beendet", value: data.item || "Diamantschwert" },
    { name: "Käufer", value: data.buyer || "Player123", inline: true },
    { name: "Verkaufspreis", value: `$${(data.price || 250000).toLocaleString("de-DE")}`, inline: true },
    { name: "Status", value: data.status || "Verkauft", inline: true }
  );
  else if (type === "outbid") base.addFields(
    { name: "📈 Du wurdest überboten", value: data.item || "Diamantschwert" },
    { name: "Dein Gebot", value: `$${(data.myBid || 100000).toLocaleString("de-DE")}`, inline: true },
    { name: "Neues Gebot", value: `$${(data.newBid || 125000).toLocaleString("de-DE")}`, inline: true },
    { name: "Höchstbietender", value: data.highestBidder || "Player123", inline: true }
  );
  else if (type === "won") base.addFields(
    { name: "🏆 Auktion gewonnen!", value: data.item || "Diamantschwert" },
    { name: "Endpreis", value: `$${(data.price || 250000).toLocaleString("de-DE")}`, inline: true },
    { name: "Dein Gebot", value: `$${(data.myBid || 250000).toLocaleString("de-DE")}`, inline: true },
    { name: "Verkäufer", value: data.seller || "Player123", inline: true }
  );
  return base;
}

app.post("/api/auction/test/:type", requirePermission("roleManagement"), async (req, res) => {
  const { type } = req.params;
  const { discordId, data } = req.body;
  const validTypes = ["bid_on_own", "own_auction_ended", "outbid", "won"];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Ungültiger Testtyp" });
  if (!discordId) return res.status(400).json({ error: "discordId fehlt" });
  try {
    const embed = buildTestEmbed(type, data || {});
    const payload = { embeds: [embed] };
    await embedBuilder.sendToUserRest(discordId, payload);
    res.json({ success: true, message: `Testnachricht ${type} an ${discordId} gesendet.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/auction/test-all", requirePermission("roleManagement"), async (req, res) => {
  const { discordId, data } = req.body;
  if (!discordId) return res.status(400).json({ error: "discordId fehlt" });
  const results = [];
  for (const type of ["bid_on_own", "own_auction_ended", "outbid", "won"]) {
    try {
      const embed = buildTestEmbed(type, data || {});
      await embedBuilder.sendToUserRest(discordId, { embeds: [embed] });
      results.push({ type, success: true });
    } catch (e) {
      results.push({ type, success: false, error: e.message });
    }
  }
  res.json({ success: true, results });
});

// ============ SITE LOCK ROUTES ============
app.get("/api/site-lock", (req, res) => {
  const config = getSiteLockConfig();
  res.json({
    enabled: config.enabled,
    reason: config.reason || "",
    allowedPages: config.allowedPages || [],
    blockedPages: config.blockedPages || [],
    loggedIn: !!(req.session && req.session.loggedIn),
    maintenanceBypass: !!(req.session && req.session.maintenanceBypass)
  });
});

app.post("/api/site-lock", requirePermission("roleManagement"), (req, res) => {
  const { enabled, reason, allowedPages, blockedPages } = req.body;
  const config = getSiteLockConfig();
  config.enabled = Boolean(enabled);
  config.reason = String(reason || "");
  if (Array.isArray(allowedPages)) config.allowedPages = allowedPages;
  if (Array.isArray(blockedPages)) config.blockedPages = blockedPages;
  saveSiteLockConfig(config);
  writeAudit(req.session.username, "site_lock_set", `Website-Sperre ${config.enabled ? "aktiviert" : "deaktiviert"}${config.reason ? " (" + config.reason + ")" : ""}`);
  res.json({ success: true, config });
});

// ============ THEME API ============
app.get("/api/themes", (req, res) => {
  res.json({ themes: ALLOWED_THEMES });
});

app.get("/api/theme", (req, res) => {
  res.json(getThemeConfig());
});

app.post("/api/theme", requirePermission("roleManagement"), (req, res) => {
  const { activeTheme } = req.body;
  if (!ALLOWED_THEMES.includes(activeTheme)) {
    return res.status(400).json({ error: "Ungültiges Theme" });
  }
  const config = getThemeConfig();
  config.activeTheme = activeTheme;
  saveThemeConfig(config);
  writeAudit(req.session.username, "theme_set", `Website-Theme auf ${activeTheme} geändert`);
  res.json({ success: true, config });
});

app.post("/api/maintenance/bypass", (req, res) => {
  const { username, password, rememberMe } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Benutzername und Passwort erforderlich" });

  const profiles = profileSystem.loadProfiles(req.session?.guildId);
  const entry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === username.toLowerCase() || p.discordId === username);
  if (!entry) return res.status(401).json({ error: "Login nicht gefunden" });

  const [userId, profile] = entry;
  if (!profileSystem.validatePassword(req.session?.guildId, userId, password)) {
    return res.status(401).json({ error: "Falsches Passwort" });
  }

  if (!hasPermission(profile.discordName, "maintenanceAccess")) {
    return res.status(403).json({ error: "Kein Wartungszugang" });
  }

  req.session.maintenanceBypass = true;
  req.session.maintenanceBypassUser = profile.discordName;
  setSessionDuration(req, rememberMe);

  res.json({ success: true, maintenanceBypass: true });
});

app.post("/api/maintenance/bypass/logout", (req, res) => {
  if (req.session) {
    req.session.maintenanceBypass = false;
    req.session.maintenanceBypassUser = null;
  }
  res.json({ success: true });
});

// ============ AUTH ROUTES ============
// Helper: Guild-Info von Discord API holen (Fallback wenn Bot nicht läuft)
let _discordGuildCache = {}; // In-Memory Cache: guildId → {name, icon, memberCount, fetchedAt}
const DISCORD_GUILD_CACHE_TTL = 5 * 60 * 1000; // 5 Minuten

async function fetchGuildFromDiscord(guildId) {
  // Prüfe In-Memory Cache
  const cached = _discordGuildCache[guildId];
  if (cached && Date.now() - cached.fetchedAt < DISCORD_GUILD_CACHE_TTL) {
    return cached;
  }
  try {
    const token = process.env.TOKEN;
    if (!token) return null;
    // Discord API: GET /guilds/{guild.id} — benötigt Bot Token
    const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { "Authorization": `Bot ${token}` }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const guild = {
      id: data.id,
      name: data.name,
      memberCount: data.approximate_member_count || 0,
      icon: data.icon ? `https://cdn.discordapp.com/icons/${data.id}/${data.icon}.png` : null,
      fetchedAt: Date.now()
    };
    _discordGuildCache[guildId] = guild;
    return guild;
  } catch (e) {
    return null;
  }
}

// Helper: Alle Guilds holen (wo der Bot drauf ist)
async function getAllGuilds() {
  const { ALLOWED_GUILDS } = require("../modules/config");
  const guildsCache = botStatus.getGuildsCache();

  // Wenn Bot-Cache vorhanden und nicht leer → verwende diesen
  if (guildsCache && guildsCache.length > 0) {
    return guildsCache.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount, icon: g.icon }));
  }

  // Fallback: Discord API direkt abfragen
  const result = [];
  for (const guildId of ALLOWED_GUILDS) {
    if (!guildId) continue;
    const guild = await fetchGuildFromDiscord(guildId);
    if (guild) {
      result.push(guild);
    } else {
      // Letzter Fallback: nur ID
      result.push({ id: guildId, name: `Guild ${guildId}`, memberCount: 0, icon: null });
    }
  }
  return result;
}

// Helper: Guilds holen wo ein bestimmter User (discordName) Mitglied ist
async function getGuildsForUser(discordName) {
  const allGuilds = await getAllGuilds();
  const membersCache = botStatus.getGuildMembersCache();
  // Wenn kein Members-Cache da ist → alle Guilds zeigen (Fallback)
  if (!membersCache || Object.keys(membersCache).length === 0) {
    return allGuilds;
  }
  const lowerName = discordName.toLowerCase();
  const result = [];
  for (const guild of allGuilds) {
    const members = membersCache[guild.id];
    if (!members) continue;
    const isMember = members.some(m =>
      (m.name || "").toLowerCase() === lowerName || m.id === discordName
    );
    if (isMember) result.push(guild);
  }
  return result;
}

// PRE-LOGIN: User gibt Discord-Name + Passwort ein → bekommt nur Guilds wo er drauf ist
app.post("/api/pre-login", async (req, res) => {
  const { username, password, rememberMe } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Benutzername und Passwort erforderlich" });
  }

  // User gegen globale profiles.json validieren
  const profiles = profileSystem.loadProfiles(req.session?.guildId);
  const entry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === username.toLowerCase());
  if (!entry) {
    return res.status(401).json({ error: "Benutzer nicht gefunden" });
  }
  const [userId, profile] = entry;
  if (!profile.password || profile.password !== password) {
    return res.status(401).json({ error: "Falsches Passwort" });
  }

  // Guilds finden wo dieser User Mitglied ist
  const userGuilds = await getGuildsForUser(profile.discordName || username);

  // Session vorbereiten (noch ohne guildId — wird bei select-guild gesetzt)
  req.session.preLoggedIn = true;
  req.session.username = profile.discordName || username;
  req.session.rememberMe = !!rememberMe;
  setSessionDuration(req, rememberMe);

  res.json({ success: true, guilds: userGuilds });
});

// MASTER-LOGIN: Globales Master-Passwort → alle Guilds
app.post("/api/master-login", async (req, res) => {
  const { password, rememberMe } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Passwort erforderlich" });
  }
  if (password !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: "Falsches Master-Passwort" });
  }
  const allGuilds = await getAllGuilds();
  req.session.preLoggedIn = true;
  req.session.username = "admin";
  req.session.rememberMe = !!rememberMe;
  setSessionDuration(req, rememberMe);
  res.json({ success: true, guilds: allGuilds, isMaster: true });
});

// GUILD SELECT: User wählt eine Guild aus der Liste → Session wird finalisiert
app.post("/api/select-guild", async (req, res) => {
  const { guildId } = req.body;
  if (!req.session || !req.session.preLoggedIn) {
    return res.status(401).json({ error: "Nicht eingeloggt" });
  }
  // Prüfe Guild gegen .env ALLOWED_GUILDS UND guildsCache (Bot könnte neue Guilds auto-added haben)
  const { ALLOWED_GUILDS } = require("../modules/config");
  let validGuild = ALLOWED_GUILDS.includes(guildId);
  if (!validGuild) {
    // Fallback: Prüfe guildsCache.json (vom Bot geschrieben)
    const guildsCache = botStatus.getGuildsCache();
    validGuild = guildsCache.some(g => g.id === guildId);
  }
  if (!validGuild) {
    // Fallback: Prüfe Discord API ob der Bot auf dieser Guild ist
    try {
      const allGuilds = await getAllGuilds();
      validGuild = allGuilds.some(g => g.id === guildId);
    } catch (e) {}
  }
  if (!guildId || !validGuild) {
    return res.status(400).json({ error: "Ungültige Guild-ID" });
  }

  const username = req.session.username || "admin";
  const isMaster = username === "admin";

  if (isMaster) {
    // Master-Admin: alle Rechte
    const rolesConfig = getGuildRolesConfig(guildId);
    req.session.loggedIn = true;
    req.session.preLoggedIn = false;
    req.session.username = "admin";
    req.session.role = "admin";
    req.session.guildId = guildId;
    return res.json({
      success: true,
      redirect: `/dashboard/${guildId}`,
      role: "admin",
      guildId,
      permissions: Object.values(rolesConfig.roles).flatMap(r => r.permissions),
    });
  }

  // Normaler User: Rolle aus Guild-roles.json prüfen
  const roleName = getGuildUserRole(guildId, username);
  if (!roleName) {
    return res.status(403).json({ error: "Keine Dashboard-Rolle in dieser Guild zugewiesen." });
  }
  const perms = getGuildRolePermissions(guildId, roleName);
  if (!perms.includes("dashboardAccess")) {
    return res.status(403).json({ error: "Kein Dashboard-Zugang für diese Guild." });
  }
  req.session.loggedIn = true;
  req.session.preLoggedIn = false;
  req.session.role = roleName;
  req.session.guildId = guildId;
  res.json({ success: true, redirect: `/dashboard/${guildId}`, role: roleName, guildId, permissions: perms });
});

// LOGIN (direkt auf /dashboard/:guildId Seite): guildId aus Body
app.post("/api/login", async (req, res) => {
  const { password, username, rememberMe, guildId } = req.body;
  const { ALLOWED_GUILDS } = require("../modules/config");
  let validGuild = ALLOWED_GUILDS.includes(guildId);
  if (!validGuild) {
    const guildsCache = botStatus.getGuildsCache();
    validGuild = guildsCache.some(g => g.id === guildId);
  }
  if (!validGuild) {
    try {
      const allGuilds = await getAllGuilds();
      validGuild = allGuilds.some(g => g.id === guildId);
    } catch (e) {}
  }
  if (!guildId || !validGuild) {
    return res.status(400).json({ error: "Ungültige Guild-ID" });
  }

  // Master-Admin
  if (!username && password === DASHBOARD_PASSWORD) {
    const rolesConfig = getGuildRolesConfig(guildId);
    req.session.loggedIn = true;
    req.session.username = "admin";
    req.session.role = "admin";
    req.session.guildId = guildId;
    setSessionDuration(req, rememberMe);
    return res.json({ success: true, role: "admin", guildId, permissions: Object.values(rolesConfig.roles).flatMap(r => r.permissions) });
  }

  // Pro-Guild Admin-Passwort
  const guildConfig = getGuildConfig(guildId);
  if (!username && guildConfig.adminPassword && password === guildConfig.adminPassword) {
    const rolesConfig = getGuildRolesConfig(guildId);
    req.session.loggedIn = true;
    req.session.username = "admin";
    req.session.role = "admin";
    req.session.guildId = guildId;
    setSessionDuration(req, rememberMe);
    return res.json({ success: true, role: "admin", guildId, permissions: Object.values(rolesConfig.roles).flatMap(r => r.permissions) });
  }

  // Normaler User
  if (username) {
    const guildProfilesFile = GUILD_PROFILES_FILE(guildId);
    let profiles = {};
    if (fs.existsSync(guildProfilesFile)) {
      profiles = loadJson(guildProfilesFile, {});
    } else {
      profiles = profileSystem.loadProfiles(guildId);
    }
    const entry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === username.toLowerCase());
    if (entry) {
      const [userId, profile] = entry;
      if (!profile.password || profile.password !== password) {
        return res.status(401).json({ error: "Falsches Passwort oder Benutzer nicht gefunden" });
      }
      const roleName = getGuildUserRole(guildId, username);
      if (!roleName) {
        return res.status(403).json({ error: "Keine Dashboard-Rolle in dieser Guild zugewiesen." });
      }
      const perms = getGuildRolePermissions(guildId, roleName);
      if (!perms.includes("dashboardAccess")) {
        return res.status(403).json({ error: "Kein Dashboard-Zugang. Berechtigung 'dashboardAccess' fehlt." });
      }
      req.session.loggedIn = true;
      req.session.username = username;
      req.session.role = roleName;
      req.session.guildId = guildId;
      req.session.firstLogin = !!profile.firstLogin;
      setSessionDuration(req, rememberMe);
      return res.json({ success: true, role: roleName, guildId, permissions: perms, firstLogin: !!profile.firstLogin });
    }
  }

  res.status(401).json({ error: "Falsches Passwort oder Benutzer nicht gefunden" });
});

// ============ PASSWORT ÄNDERN (für firstLogin) ============
app.post("/api/change-password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Neues Passwort muss mindestens 6 Zeichen lang sein." });
  }
  const guildId = req.session.guildId;
  const username = req.session.username;
  if (!guildId || !username || username === "admin") {
    return res.status(403).json({ error: "Master-Admin kann hier kein Passwort ändern." });
  }

  const profilesFile = GUILD_PROFILES_FILE(guildId);
  let profiles = {};
  if (fs.existsSync(profilesFile)) {
    profiles = loadJson(profilesFile, {});
  }
  const entry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === username.toLowerCase());
  if (!entry) {
    return res.status(404).json({ error: "Benutzer nicht gefunden." });
  }
  const [userId, profile] = entry;
  // Aktuelles Passwort prüfen (außer bei firstLogin — da wurde das generierte gerade benutzt)
  if (!req.session.firstLogin) {
    if (profile.password !== currentPassword) {
      return res.status(401).json({ error: "Aktuelles Passwort falsch." });
    }
  }
  profile.password = newPassword;
  profile.firstLogin = false;
  profiles[userId] = profile;
  saveJsonSync(profilesFile, profiles);
  req.session.firstLogin = false;
  res.json({ success: true });
});

// ============ FIRST-LOGIN STATUS ============
app.get("/api/first-login", requireAuth, (req, res) => {
  res.json({ firstLogin: !!req.session.firstLogin });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/guilds", requireAuth, async (req, res) => {
  const guilds = await getAllGuilds();
  res.json({ guilds, currentGuildId: req.session.guildId || null });
});

// GUILD SWITCH: Bereits eingeloggter User wechselt Guild ohne neuem Login
app.post("/api/switch-guild", requireAuth, async (req, res) => {
  const { guildId } = req.body;
  if (!guildId) return res.status(400).json({ error: "Guild-ID erforderlich" });

  const { ALLOWED_GUILDS } = require("../modules/config");
  let validGuild = ALLOWED_GUILDS.includes(guildId);
  if (!validGuild) {
    const guildsCache = botStatus.getGuildsCache();
    validGuild = guildsCache.some(g => g.id === guildId);
  }
  if (!validGuild) {
    try {
      const allGuilds = await getAllGuilds();
      validGuild = allGuilds.some(g => g.id === guildId);
    } catch (e) {}
  }
  if (!validGuild) return res.status(400).json({ error: "Ungültige Guild-ID" });

  const username = req.session.username || "admin";
  const isMaster = username === "admin";

  if (isMaster) {
    const rolesConfig = getGuildRolesConfig(guildId);
    req.session.guildId = guildId;
    req.session.role = "admin";
    return res.json({
      success: true,
      redirect: `/dashboard/${guildId}`,
      role: "admin",
      guildId,
      permissions: Object.values(rolesConfig.roles).flatMap(r => r.permissions),
    });
  }

  // Normaler User: Rolle in neuer Guild prüfen
  const roleName = getGuildUserRole(guildId, username);
  if (!roleName) {
    return res.status(403).json({ error: "Keine Dashboard-Rolle in dieser Guild zugewiesen." });
  }
  const perms = getGuildRolePermissions(guildId, roleName);
  if (!perms.includes("dashboardAccess")) {
    return res.status(403).json({ error: "Kein Dashboard-Zugang für diese Guild." });
  }
  req.session.guildId = guildId;
  req.session.role = roleName;
  res.json({ success: true, redirect: `/dashboard/${guildId}`, role: roleName, guildId, permissions: perms });
});

app.get("/api/current-guild", requireAuth, async (req, res) => {
  if (!req.session.guildId) {
    return res.json({ selected: false });
  }
  // Versuche Bot-Cache, dann Discord API
  const guild = await fetchGuildFromDiscord(req.session.guildId);
  if (guild) {
    return res.json({ selected: true, guildId: guild.id, guildName: guild.name, guildIcon: guild.icon });
  }
  // Letzter Fallback
  const guildsCache = botStatus.getGuildsCache();
  const cached = guildsCache.find(g => g.id === req.session.guildId);
  if (cached) {
    return res.json({ selected: true, guildId: cached.id, guildName: cached.name, guildIcon: cached.icon });
  }
  res.json({ selected: true, guildId: req.session.guildId, guildName: `Guild ${req.session.guildId}`, guildIcon: null });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get("/api/auth-check", (req, res) => {
  if (!req.session || !req.session.loggedIn) return res.json({ loggedIn: false });
  const username = req.session.username || "admin";
  const role = req.session.role || "admin";
  const guildId = req.session.guildId || null;
  // Lade Permissions aus der Guild-spezifischen roles.json
  let perms = [];
  if (guildId) {
    const rolesConfig = getGuildRolesConfig(guildId);
    perms = username === "admin"
      ? Object.values(rolesConfig.roles).reduce((all, r) => [...new Set([...all, ...r.permissions])], [])
      : getGuildRolePermissions(guildId, role);
  }
  res.json({
    loggedIn: true,
    username,
    role,
    permissions: perms,
    guildId,
  });
});

// ============ INFO ============
app.get("/api/info", requireAuth, (req, res) => {
  res.json({ title: DASHBOARD_TITLE, version: "1.3.0" });
});

// ============ RESTART MANAGER PROXY ============
function _rmProxy(req, res) {
  const subPath = req.params[0] || "";
  const queryIndex = req.url.indexOf("?");
  const query = queryIndex !== -1 ? req.url.slice(queryIndex) : "";
  const rmPath = "/api/" + subPath + query;
  const options = {
    hostname: RM_HOST,
    port: RM_PORT,
    path: rmPath,
    method: req.method,
    headers: { ...req.headers, "x-api-key": RM_API_KEY, host: `${RM_HOST}:${RM_PORT}` }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode || 500);
    Object.entries(proxyRes.headers).forEach(([key, value]) => {
      if (value && key.toLowerCase() !== "transfer-encoding") res.setHeader(key, value);
    });
    proxyRes.pipe(res);
  });
  proxyReq.on("error", (err) => {
    console.error("Restart-Manager Proxy Error:", err.message);
    res.status(502).json({ ok: false, error: "Restart Manager nicht erreichbar" });
  });
  req.pipe(proxyReq);
}
app.all("/api/restart-manager/*", requireAuth, _rmProxy);
app.all("/api/rm/*", _rmProxy);
app.all("/proxy/rm/*", _rmProxy);

// (site-lock routes defined above at SITE LOCK ROUTES section)

// ============ BOT STATUS & MAINTENANCE ============
app.get("/api/bot-status", (req, res) => {
  const status = botStatus.getBotStatus();
  const twoMinutes = 2 * 60 * 1000;
  const online = status.lastHeartbeat && (Date.now() - status.lastHeartbeat) < twoMinutes;
  res.json({
    online: !!online,
    maintenance: !!status.maintenance,
    reason: status.reason || "",
    updatedBy: status.updatedBy || null,
    updatedAt: status.updatedAt || null,
    ping: status.ping != null ? status.ping : null,
    uptime: status.uptime || 0,
    guilds: status.guilds || 0,
    users: status.users || 0,
    lastHeartbeat: status.lastHeartbeat || null
  });
});

app.post("/api/bot-status/maintenance", requirePermission("roleManagement"), (req, res) => {
  const { enabled, reason } = req.body;
  const status = botStatus.setMaintenance(!!enabled, reason || "", req.session.username || "admin");
  writeAudit(req.session.username, "bot_maintenance_set", `Bot-Wartung ${status.maintenance ? "aktiviert" : "deaktiviert"}${status.reason ? " (" + status.reason + ")" : ""}`);
  res.json({ success: true, status: { maintenance: status.maintenance, reason: status.reason } });
});

// ============ INTERNAL: SEND DISCORD DM (for Event Portal discord-link) ============
app.post("/api/internal/send-dm", async (req, res) => {
  const internalSecret = process.env.DASHBOARD_SECRET || "dhbt-internal";
  if (req.body.secret !== internalSecret) {
    return res.status(403).json({ error: "Nicht autorisiert." });
  }
  const { discordId, content, embed } = req.body;
  if (!discordId) return res.status(400).json({ error: "discordId erforderlich." });
  const client = botStatus.getClient ? botStatus.getClient() : null;
  if (!client) return res.status(503).json({ error: "Bot nicht verfügbar." });
  try {
    const user = await client.users.fetch(discordId).catch(() => null);
    if (!user) return res.status(404).json({ error: "Discord-User nicht gefunden." });
    const payload = {};
    if (content) payload.content = content;
    if (embed) payload.embeds = [embed];
    await user.send(payload);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/stats", (req, res) => {
  const env = req.query.env === "test" || req.query.env === "main" ? req.query.env : "main";
  res.json(getStats(env));
});

// ============ KARTEN BESTELLUNGEN ============
const KARTEN_ORDERS_FILE = path.join(DATA_DIR, "kartenOrders.json");
const KARTEN_ORDER_COUNTER_FILE = path.join(DATA_DIR, "kartenOrderCounter.json");
const KARTEN_ORDERS_ZIP_DIR = path.join(DATA_DIR, "kartenOrders");

if (!fs.existsSync(KARTEN_ORDERS_ZIP_DIR)) {
  fs.mkdirSync(KARTEN_ORDERS_ZIP_DIR, { recursive: true });
}

function getKartenOrders() {
  return loadJson(KARTEN_ORDERS_FILE, []);
}

function saveKartenOrders(orders) {
  saveJsonSync(KARTEN_ORDERS_FILE, orders);
}

function getNextKartenOrderNumber(env = "main") {
  const counters = loadJson(KARTEN_ORDER_COUNTER_FILE, { main: 0, test: 0 });
  counters[env] = (Number(counters[env]) || 0) + 1;
  saveJsonSync(KARTEN_ORDER_COUNTER_FILE, counters);
  return counters[env];
}

function getKartenOrderZipPath(orderId) {
  return path.join(KARTEN_ORDERS_ZIP_DIR, `${orderId}.zip`);
}

function saveKartenOrderZip(orderId, base64) {
  const zipPath = getKartenOrderZipPath(orderId);
  fs.writeFileSync(zipPath, Buffer.from(base64, "base64"));
  return zipPath;
}

function loadKartenOrderZip(orderId) {
  const zipPath = getKartenOrderZipPath(orderId);
  if (!fs.existsSync(zipPath)) return null;
  return fs.readFileSync(zipPath);
}

function deleteKartenOrderZip(orderId) {
  const zipPath = getKartenOrderZipPath(orderId);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
}

app.post("/api/karten-order", (req, res) => {
  try {
    const { username, mapType, zipBase64, filename, mapSizeX, mapSizeY } = req.body;
    if (!username || !mapType || !zipBase64) {
      return res.status(400).json({ error: "Username, Karten-Art und ZIP-Datei sind erforderlich." });
    }
    const config = loadJson(CONFIG_FILE, {});
    const kartenLimit = config.kartenOrderLimit || 0;
    if (kartenLimit > 0 && countActiveKartenOrders() >= kartenLimit) {
      return res.status(429).json({ error: `Das Bestelllimit für Karten ist erreicht (${kartenLimit}). Bitte warte, bis ein Auftrag abgeschlossen wird.` });
    }
    const maxX = config.kartenMaxMapSizeX || 0;
    const maxY = config.kartenMaxMapSizeY || 0;
    const sizeX = Number(mapSizeX) || 1;
    const sizeY = Number(mapSizeY) || 1;
    if (maxX > 0 && sizeX > maxX) {
      return res.status(400).json({ error: `Kartengröße überschreitet das Maximum: Breite darf maximal ${maxX} sein (aktuell ${sizeX}).` });
    }
    if (maxY > 0 && sizeY > maxY) {
      return res.status(400).json({ error: `Kartengröße überschreitet das Maximum: Höhe darf maximal ${maxY} sein (aktuell ${sizeY}).` });
    }
    const isTestHost = req.hostname === "test.dhbt-clan.com" || req.hostname === "localhost" || req.hostname === "127.0.0.1";
    const env = isTestHost ? "test" : "main";
    const orderNumber = getNextKartenOrderNumber(env);
    const orderId = `${Date.now()}_${orderNumber}`;
    saveKartenOrderZip(orderId, zipBase64);
    const order = {
      id: orderId,
      env,
      orderNumber,
      username: username.toString().trim(),
      mapType: mapType.toString().trim(),
      mapSize: `${sizeX}x${sizeY}`,
      filename: (filename || "karte.zip").toString(),
      status: "pending",
      createdAt: Date.now(),
      threadId: null,
      error: null
    };
    const orders = getKartenOrders();
    orders.push(order);
    saveKartenOrders(orders);
    res.json({ success: true, orderId: order.id, orderNumber });
  } catch (err) {
    console.error("[KartenOrder] API Fehler:", err.message);
    res.status(500).json({ error: "Interner Fehler beim Speichern der Bestellung." });
  }
});

app.post("/api/karten-order-image", (req, res) => {
  try {
    const { username, mapType, imageBase64, filename } = req.body;
    if (!username || !mapType || !imageBase64) {
      return res.status(400).json({ error: "Username, Karten-Art und Bild sind erforderlich." });
    }
    const config = loadJson(CONFIG_FILE, {});
    const kartenLimit = config.kartenOrderLimit || 0;
    if (kartenLimit > 0 && countActiveKartenOrders() >= kartenLimit) {
      return res.status(429).json({ error: `Das Bestelllimit für Karten ist erreicht (${kartenLimit}). Bitte warte, bis ein Auftrag abgeschlossen wird.` });
    }
    const isTestHost = req.hostname === "test.dhbt-clan.com" || req.hostname === "localhost" || req.hostname === "127.0.0.1";
    const env = isTestHost ? "test" : "main";
    const orderNumber = getNextKartenOrderNumber(env);
    const orderId = `${Date.now()}_${orderNumber}`;
    // Save image as file
    const ext = (filename || "bild.png").split(".").pop() || "png";
    const imgFilename = `${orderId}.${ext}`;
    const imgDir = path.join(DATA_DIR, "karten_images");
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, imgFilename), Buffer.from(imageBase64, "base64"));
    const order = {
      id: orderId,
      env,
      orderNumber,
      username: username.toString().trim(),
      mapType: mapType.toString().trim(),
      mapSize: "Bild",
      filename: (filename || "bild.png").toString(),
      imageFile: imgFilename,
      isImageOrder: true,
      status: "pending",
      createdAt: Date.now(),
      threadId: null,
      error: null
    };
    const orders = getKartenOrders();
    orders.push(order);
    saveKartenOrders(orders);
    res.json({ success: true, orderId: order.id, orderNumber });
  } catch (err) {
    console.error("[KartenOrderImage] API Fehler:", err.message);
    res.status(500).json({ error: "Interner Fehler beim Speichern der Bestellung." });
  }
});

app.get("/api/karten-order/max-size", (req, res) => {
  const config = loadJson(CONFIG_FILE, {});
  res.json({
    maxMapSizeX: config.kartenMaxMapSizeX || 0,
    maxMapSizeY: config.kartenMaxMapSizeY || 0
  });
});

app.get("/api/karten-order/status", (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: "orderId fehlt" });
    const orders = getKartenOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: "Bestellung nicht gefunden" });
    res.json({
      id: order.id,
      status: order.status,
      orderNumber: order.orderNumber,
      inviteUrl: order.inviteUrl || null,
      error: order.error || null,
      threadId: order.threadId || null
    });
  } catch (err) {
    console.error("[KartenOrder] Status API Fehler:", err.message);
    res.status(500).json({ error: "Interner Fehler" });
  }
});

// ============ BUILDER BESTELLUNGEN ============
app.post("/api/builder-order", (req, res) => {
  try {
    const { username, buildType, plotSize, extraWishes, schematicAvailable, schematicBase64, schematicFilename } = req.body;
    if (!username || !buildType || !plotSize) {
      return res.status(400).json({ error: "Discordname, Art des Bauwerkes und Plotgröße sind erforderlich." });
    }
    const config = loadJson(CONFIG_FILE, {});
    const builderLimit = config.builderOrderLimit || 0;
    if (builderLimit > 0 && countActiveBuilderOrders() >= builderLimit) {
      return res.status(429).json({ error: `Das Bestelllimit für Builder-Aufträge ist erreicht (${builderLimit}). Bitte warte, bis ein Auftrag abgeschlossen wird.` });
    }
    const isTestHost = req.hostname === "test.dhbt-clan.com" || req.hostname === "localhost" || req.hostname === "127.0.0.1";
    const env = isTestHost ? "test" : "main";
    const orderNumber = builderOrders.getNextOrderNumber(env);
    const orderId = `${Date.now()}_${orderNumber}`;
    if (schematicAvailable && schematicBase64) {
      builderOrders.saveSchematic(orderId, schematicBase64);
    }
    const order = {
      id: orderId,
      env,
      orderNumber,
      username: username.toString().trim(),
      buildType: buildType.toString().trim(),
      plotSize: plotSize.toString().trim(),
      extraWishes: extraWishes ? extraWishes.toString().trim() : "",
      schematicAvailable: Boolean(schematicAvailable),
      schematicFilename: (schematicFilename || "schematic.schem").toString(),
      status: "pending",
      createdAt: Date.now(),
      error: null
    };
    const orders = builderOrders.getOrders();
    orders.push(order);
    builderOrders.saveOrders(orders);
    res.json({ success: true, orderId: order.id, orderNumber });
  } catch (err) {
    console.error("[BuilderOrder] API Fehler:", err.message);
    res.status(500).json({ error: "Interner Fehler beim Speichern der Bestellung." });
  }
});

app.get("/api/builder-order/status", (req, res) => {
  try {
    const { orderId } = req.query;
    if (!orderId) return res.status(400).json({ error: "orderId fehlt" });
    const orders = builderOrders.getOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ error: "Bestellung nicht gefunden" });
    res.json({
      id: order.id,
      status: order.status,
      orderNumber: order.orderNumber,
      inviteUrl: order.inviteUrl || null,
      error: order.error || null
    });
  } catch (err) {
    console.error("[BuilderOrder] Status API Fehler:", err.message);
    res.status(500).json({ error: "Interner Fehler" });
  }
});

// ============ USER NAME CACHE ============
app.get("/api/users/names", requireAuth, (req, res) => {
  const cache = loadJson(path.join(DATA_DIR, "userCache.json"), {});
  res.json(cache);
});

// ============ LEADERBOARDS ============
app.get("/api/leaderboard/coins", requirePermission("coins"), (req, res) => {
  const coins = loadGuildJson(req, "coins.json", {});
  const botId = process.env.MAIN_BOT_ID || process.env.TEST_BOT_ID;
  const top = Object.entries(coins)
    .filter(([id]) => id !== botId && id !== "BOT")
    .map(([userId, balance]) => ({ userId, balance: Number(balance) }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 25);
  res.json(top);
});

app.get("/api/leaderboard/xp", requirePermission("xp"), (req, res) => {
  const xpData = loadGuildJson(req, "xpData.json", {});
  const botId = process.env.MAIN_BOT_ID || process.env.TEST_BOT_ID;
  const top = Object.entries(xpData)
    .filter(([id]) => id !== botId && id !== "BOT")
    .map(([userId, u]) => ({ userId, xp: u.xp || 0, level: u.level || 1, prestige: u.prestige || 0 }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 25);
  res.json(top);
});

app.get("/api/leaderboard/xp/:userId", requirePermission("xp"), (req, res) => {
  const xpData = loadGuildJson(req, "xpData.json", {});
  const botId = process.env.MAIN_BOT_ID || process.env.TEST_BOT_ID;
  const users = Object.entries(xpData)
    .filter(([id]) => id !== botId && id !== "BOT")
    .map(([userId, u]) => ({ userId, xp: u.xp || 0, level: u.level || 1, prestige: u.prestige || 0 }))
    .sort((a, b) => b.xp - a.xp);
  const rank = users.findIndex(u => u.userId === req.params.userId) + 1;
  const user = users.find(u => u.userId === req.params.userId);
  if (!user) return res.status(404).json({ error: "Nicht gefunden" });
  res.json({ ...user, rank });
});

// ============ ECONOMY CONFIG ============
app.get("/api/settings/economy", requirePermission("economy"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  res.json({
    messageReward: config.messageReward || 1,
    messageRewardInterval: config.messageRewardInterval || 3,
    voiceRewardPerMinute: config.voiceRewardPerMinute || 1,
    payMaxAmountPerTransfer: config.payMaxAmountPerTransfer || 200,
    payMaxAmountPerDay: config.payMaxAmountPerDay || 500,
    payMaxReceivedPerWeek: config.payMaxReceivedPerWeek || 1000,
    payTransferCooldownMs: config.payTransferCooldownMs || 3600000
  });
});

app.post("/api/settings/economy", requirePermission("economy"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  const fields = ["messageReward","messageRewardInterval","voiceRewardPerMinute","payMaxAmountPerTransfer","payMaxAmountPerDay","payMaxReceivedPerWeek","payTransferCooldownMs"];
  for (const f of fields) { if (req.body[f] !== undefined) config[f] = Number(req.body[f]); }
  saveGuildJsonSync(req, "config.json", config);
  res.json({ success: true });
});

// ============ XP CONFIG ============
app.get("/api/settings/xpconfig", requirePermission("xpConfig"), (req, res) => {
  const xpCfg = loadGuildJson(req, "xpConfig.json", {});
  res.json(xpCfg);
});

app.post("/api/settings/xpconfig", requirePermission("xpConfig"), (req, res) => {
  const xpCfg = loadGuildJson(req, "xpConfig.json", {});
  Object.assign(xpCfg, req.body);
  saveGuildJsonSync(req, "xpConfig.json", xpCfg);
  res.json({ success: true });
});

// ============ KARTEN CONFIG ============
app.get("/api/settings/karten", requirePermission("kartenSettings"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  res.json({
    createThread: config.kartenCreateThread !== false,
    pingRoleId: config.kartenPingRoleId || "",
    forumChannelId: config.kartenForumChannelId || "",
    mainPingRoleId: config.kartenMainPingRoleId || "1346159348984053901",
    testPingRoleId: config.kartenTestPingRoleId || "1520850783774572613",
    mainForumChannelId: config.kartenMainForumChannelId || "1520847620959113216",
    testForumChannelId: config.kartenTestForumChannelId || "1520849385297023039",
    notificationChannelId: config.kartenNotificationChannelId || "",
    maxMapSizeX: config.kartenMaxMapSizeX || 0,
    maxMapSizeY: config.kartenMaxMapSizeY || 0
  });
});

app.post("/api/settings/karten", requirePermission("kartenSettings"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  const boolFields = ["createThread"];
  const stringFields = ["pingRoleId", "forumChannelId", "mainPingRoleId", "testPingRoleId", "mainForumChannelId", "testForumChannelId", "notificationChannelId"];
  const numberFields = ["maxMapSizeX", "maxMapSizeY"];
  for (const f of boolFields) { if (req.body[f] !== undefined) config["karten" + f.charAt(0).toUpperCase() + f.slice(1)] = Boolean(req.body[f]); }
  for (const f of stringFields) { if (req.body[f] !== undefined) config["karten" + f.charAt(0).toUpperCase() + f.slice(1)] = String(req.body[f] || ""); }
  for (const f of numberFields) { if (req.body[f] !== undefined) config["karten" + f.charAt(0).toUpperCase() + f.slice(1)] = Math.max(0, Math.floor(Number(req.body[f]) || 0)); }
  saveGuildJsonSync(req, "config.json", config);
  writeAudit(req.session.username, "karten_settings_set", "Karten-Einstellungen aktualisiert");
  res.json({ success: true });
});

// ============ ORDER LIMITS ============
app.get("/api/settings/order-limits", requirePermission("kartenSettings"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  res.json({
    kartenLimit: config.kartenOrderLimit || 0,
    builderLimit: config.builderOrderLimit || 0,
    kartenActive: countActiveKartenOrders(),
    builderActive: countActiveBuilderOrders()
  });
});

app.post("/api/settings/order-limits", requirePermission("kartenSettings"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  if (req.body.kartenLimit !== undefined) config.kartenOrderLimit = Math.max(0, Math.floor(Number(req.body.kartenLimit) || 0));
  if (req.body.builderLimit !== undefined) config.builderOrderLimit = Math.max(0, Math.floor(Number(req.body.builderLimit) || 0));
  saveGuildJsonSync(req, "config.json", config);
  writeAudit(req.session.username, "order_limits_set", `Limits: Karten=${config.kartenOrderLimit}, Builder=${config.builderOrderLimit}`);
  res.json({ success: true });
});

function countActiveKartenOrders() {
  const orders = getKartenOrders();
  return orders.filter(o => !o.closed && o.status !== "error").length;
}

function countActiveBuilderOrders() {
  const orders = builderOrders.getOrders();
  const jobs = builderOrders.getJobs();
  const activeOrders = orders.filter(o => !o.closed && o.status !== "error").length;
  const activeJobs = jobs.filter(j => !j.closed).length;
  return activeOrders + activeJobs;
}

// ============ USER BEARBEITEN ============
app.get("/api/user/:userId/coins", requirePermission("userEdit"), (req, res) => {
  const coins = loadGuildJson(req, "coins.json", {});
  const xpData = loadGuildJson(req, "xpData.json", {});
  const u = xpData[req.params.userId] || {};
  res.json({ userId: req.params.userId, balance: Number(coins[req.params.userId] || 0), xp: u.xp || 0, level: u.level || 1, prestige: u.prestige || 0 });
});

app.post("/api/user/:userId/coins", requirePermission("userEdit"), (req, res) => {
  const { amount } = req.body;
  if (!Number.isFinite(Number(amount))) return res.status(400).json({ error: "Ungültiger Betrag" });
  const coins = loadGuildJson(req, "coins.json", {});
  const old = coins[req.params.userId] || 0;
  coins[req.params.userId] = Math.max(0, Math.floor(Number(amount)));
  saveGuildJsonSync(req, "coins.json", coins);
  writeAudit(req.session.username, "coins_edit", `User ${req.params.userId}: ${old} → ${coins[req.params.userId]}`);
  res.json({ success: true, balance: coins[req.params.userId] });
});

app.post("/api/user/:userId/xp", requirePermission("userEdit"), (req, res) => {
  const { xp } = req.body;
  if (!Number.isFinite(Number(xp))) return res.status(400).json({ error: "Ungültiger XP-Wert" });
  const xpData = loadGuildJson(req, "xpData.json", {});
  if (!xpData[req.params.userId]) xpData[req.params.userId] = { xp: 0, level: 1, prestige: 0 };
  const old = xpData[req.params.userId].xp;
  xpData[req.params.userId].xp = Math.max(0, Math.floor(Number(xp)));
  saveGuildJsonSync(req, "xpData.json", xpData);
  writeAudit(req.session.username, "xp_edit", `User ${req.params.userId}: ${old} → ${xpData[req.params.userId].xp} XP`);
  res.json({ success: true });
});

app.post("/api/user/:userId/prestige", requirePermission("userEdit"), (req, res) => {
  const { prestige } = req.body;
  const value = Number(prestige);
  if (!Number.isFinite(value) || value < 0 || value > 5) return res.status(400).json({ error: "Ungültiger Prestige-Wert (0-5)" });
  const xpData = loadGuildJson(req, "xpData.json", {});
  if (!xpData[req.params.userId]) xpData[req.params.userId] = { xp: 0, level: 1, prestige: 0 };
  const old = xpData[req.params.userId].prestige || 0;
  xpData[req.params.userId].prestige = Math.floor(value);
  saveGuildJsonSync(req, "xpData.json", xpData);
  writeAudit(req.session.username, "prestige_edit", `User ${req.params.userId}: Prestige ${old} → ${xpData[req.params.userId].prestige}`);
  res.json({ success: true });
});

app.get("/api/xp/prestige/leaderboard", requirePermission("xp"), (req, res) => {
  const xpData = loadGuildJson(req, "xpData.json", {});
  const users = Object.entries(xpData)
    .map(([userId, data]) => ({ userId, prestige: Number(data.prestige) || 0, xp: Number(data.xp) || 0, level: Number(data.level) || 1 }))
    .filter(u => u.prestige > 0)
    .sort((a, b) => b.prestige - a.prestige || b.xp - a.xp);
  const distribution = {};
  for (let i = 1; i <= 5; i++) distribution[i] = users.filter(u => u.prestige === i).length;
  res.json({ users: users.slice(0, 50), total: users.length, distribution });
});

// ============ XP MULTIPLIER / BOOSTER ============
app.get("/api/xp/multiplier", requirePermission("xpConfig"), (req, res) => {
  res.json(loadGuildJson(req, "xpMultiplier.json", { multiplier: 1, startAt: null, endAt: null, reason: "", updatedBy: "", updatedAt: null }));
});

app.post("/api/xp/multiplier", requirePermission("xpConfig"), (req, res) => {
  const { multiplier, startAt, endAt, reason } = req.body;
  const value = Number(multiplier);
  if (!Number.isFinite(value) || value < 1) return res.status(400).json({ error: "Ungültiger Multiplier (mindestens 1)" });
  const data = {
    multiplier: value,
    startAt: startAt || null,
    endAt: endAt || null,
    reason: reason || "",
    updatedBy: req.session.username,
    updatedAt: Date.now()
  };
  saveGuildJsonSync(req, "xpMultiplier.json", data);
  writeAudit(req.session.username, "xp_multiplier_set", `Multiplier ${value}x${data.startAt ? " von " + new Date(data.startAt).toLocaleString("de-DE") : ""}${data.endAt ? " bis " + new Date(data.endAt).toLocaleString("de-DE") : ""}${data.reason ? " (" + data.reason + ")" : ""}`);
  res.json({ success: true, data });
});

app.post("/api/xp/multiplier/clear", requirePermission("xpConfig"), (req, res) => {
  const data = { multiplier: 1, startAt: null, endAt: null, reason: "", updatedBy: "", updatedAt: null };
  saveGuildJsonSync(req, "xpMultiplier.json", data);
  writeAudit(req.session.username, "xp_multiplier_clear", "XP Multiplier zurückgesetzt");
  res.json({ success: true });
});

// ============ LEADERBOARD BLACKLIST ============
const BL_PATH = path.join(__dirname, "..", "data", "leaderboardBlacklist.json");
app.get("/api/blacklist", requirePermission("blacklist"), (req, res) => {
  const bl = loadJson(BL_PATH, {});
  res.json(Object.keys(bl).filter(id => bl[id] === true));
});
app.post("/api/blacklist/:userId", requirePermission("blacklist"), (req, res) => {
  const bl = loadJson(BL_PATH, {}); bl[req.params.userId] = true; saveJsonSync(BL_PATH, bl); res.json({ success: true });
});
app.delete("/api/blacklist/:userId", requirePermission("blacklist"), (req, res) => {
  const bl = loadJson(BL_PATH, {}); delete bl[req.params.userId]; saveJsonSync(BL_PATH, bl); res.json({ success: true });
});

// ============ WEEKLY MISSION ============
app.get("/api/weekly", requirePermission("weekly"), (req, res) => {
  const weekly = loadGuildJson(req, "weeklyMissions.json", {});
  const nameCache = loadJson(path.join(DATA_DIR, "userCache.json"), {});
  const campaign = weekly.currentCampaign || null;
  const missionId = campaign?.selectedMissionId || null;

  const contributors = Object.entries(weekly.participants || {})
    .map(([userId, data]) => ({
      userId,
      name: (typeof nameCache[userId] === 'string' ? nameCache[userId] : nameCache[userId]?.username || nameCache[userId]?.name) || userId,
      contribution: missionId ? (data.progress?.[missionId] || 0) : 0
    }))
    .filter(u => u.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution);

  res.json({
    campaign,
    totalProgress: weekly.totalProgress || {},
    participantCount: Object.keys(weekly.participants || {}).length,
    contributors
  });
});

// ============ ACHIEVEMENTS ============
app.get("/api/achievements/stats", requirePermission("achievements"), (req, res) => {
  const ach = loadGuildJson(req, "achievements.json", { userProgress: {} });
  const userCount = Object.keys(ach.userProgress).length;
  let totalUnlocked = 0;
  for (const userAch of Object.values(ach.userProgress)) {
    totalUnlocked += Object.values(userAch).filter(a => a && a.unlocked).length;
  }
  res.json({ userCount, totalUnlocked });
});

app.get("/api/achievements/user/:userId", requirePermission("achievements"), (req, res) => {
  const ach = loadGuildJson(req, "achievements.json", { userProgress: {} });
  res.json(ach.userProgress[req.params.userId] || {});
});

// ============ ANALYTICS ============
app.get("/api/analytics", requirePermission("overview"), (req, res) => {
  res.json(analytics.getPageStats(req.query));
});
app.get("/api/analytics/live", requirePermission("overview"), (req, res) => {
  res.json(analytics.getLiveStats());
});
app.post("/api/analytics/track", (req, res) => {
  // Client-seitiges Tracking für SPA-Sections (z. B. Dashboard)
  const { path: clientPath } = req.body;
  if (clientPath && typeof clientPath === "string" && clientPath.startsWith("/")) {
    analytics.trackPageView(req, res, clientPath);
  }
  res.json({ success: true });
});
app.post("/api/analytics/reset", requirePermission("owner"), (req, res) => {
  analytics.resetAnalytics();
  writeAudit(req.session.username, "analytics_reset", "Analytics-Daten zurückgesetzt");
  res.json({ success: true });
});

// ============ MINI-GAMES STATS ============
app.get("/api/minigames/stats", requirePermission("overview"), (req, res) => {
  const cooldown = loadGuildJson(req, "miniGamesCooldown.json", { users: {} });
  const users = cooldown.users || {};
  const gameStats = { ssp: 0, duell: 0, tictactoe: 0, slots: 0, wuerfeln: 0 };
  for (const u of Object.values(users)) {
    for (const game of Object.keys(gameStats)) gameStats[game] += u[game]?.count || 0;
  }
  const total = Object.values(gameStats).reduce((s, v) => s + v, 0);
  res.json({ activeUsers: Object.keys(users).length, totalGamesToday: total, byGame: gameStats });
});

// ============ MINI-GAMES COOLDOWN ============
app.get("/api/minigames/cooldown", requirePermission("commands"), (req, res) => {
  const cooldown = loadGuildJson(req, "miniGamesCooldown.json", { users: {} });
  const users = cooldown.users || {};
  const games = ["ssp", "duell", "tictactoe", "slots", "wuerfeln"];
  const rows = [];
  for (const [userId, data] of Object.entries(users)) {
    for (const game of games) {
      const entry = data[game] || { count: 0, lastPlayedAt: null };
      if (entry.count > 0 || entry.lastPlayedAt) {
        rows.push({ userId, game, count: entry.count || 0, lastPlayedAt: entry.lastPlayedAt });
      }
    }
  }
  rows.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
  res.json({ users: rows.slice(0, 200), lastResetDay: cooldown.lastResetDay || null, totalUsers: Object.keys(users).length });
});

app.post("/api/minigames/cooldown/reset/:userId", requirePermission("commands"), (req, res) => {
  const cooldown = loadGuildJson(req, "miniGamesCooldown.json", { users: {} });
  const userId = req.params.userId;
  if (!cooldown.users) cooldown.users = {};
  if (!cooldown.users[userId]) return res.json({ success: false, error: "User nicht gefunden" });
  const games = ["ssp", "duell", "tictactoe", "slots", "wuerfeln"];
  for (const game of games) {
    if (cooldown.users[userId][game]) cooldown.users[userId][game].count = 0;
  }
  saveGuildJsonSync(req, "miniGamesCooldown.json", cooldown);
  writeAudit(req.session.username, "minigames_cooldown_reset", `User ${userId}: Mini-Games Cooldown zurückgesetzt`);
  res.json({ success: true });
});

// ============ ZAHLEN-SPIEL ============
app.get("/api/zahlen/leaderboard", requirePermission("zahlen"), async (req, res) => {
  try {
    const engine = require("../modules/zahlenGame/engine");
    const guildId = req.query.guildId || process.env.Haupt_GUILD || "1321266417500426290";
    const stats = await engine.getLeaderboard(guildId, "correct");
    res.json(stats.slice(0, 25));
  } catch (e) { res.json([]); }
});

// ============ SHOP ============
app.get("/api/shop/items", requirePermission("shop"), (req, res) => {
  const shop = loadGuildJson(req, "shop.json", { items: [], orders: [] });
  const pub = loadGuildJson(req, "publicShop.json", { items: [] });
  const all = [...(pub.items || []), ...(shop.items || [])];
  res.json(all);
});

app.get("/api/shop/orders", requirePermission("shop"), (req, res) => {
  const shop = loadGuildJson(req, "shop.json", { items: [], orders: [] });
  res.json((shop.orders || []).slice(-50).reverse());
});

// ============ DAILY MISSIONS ============
app.get("/api/dailymissions/stats", requirePermission("dailyMissions"), (req, res) => {
  const daily = loadGuildJson(req, "dailyMissions.json", {});
  const users = Object.keys(daily).length;
  let completedToday = 0;
  const today = new Date().toISOString().split("T")[0];
  for (const u of Object.values(daily)) {
    if (u.lastCompleted && u.lastCompleted.startsWith(today)) completedToday++;
  }
  res.json({ totalUsers: users, completedToday });
});

// ============ PAY HISTORY ============
app.get("/api/payhistory", requirePermission("payHistory"), (req, res) => {
  const history = loadGuildJson(req, "payHistory.json", { transfers: [] });
  res.json((history.transfers || []).slice(0, 50));
});

// ============ VOICE STATS ============
app.get("/api/voice/stats", requirePermission("voiceStats"), (req, res) => {
  const lifetime = loadGuildJson(req, "voiceLifetimeCoins.json", {});
  const botId = process.env.MAIN_BOT_ID || process.env.TEST_BOT_ID;
  const top = Object.entries(lifetime)
    .filter(([id]) => id !== botId)
    .map(([userId, coins]) => ({ userId, coins: Number(coins) }))
    .sort((a, b) => b.coins - a.coins)
    .slice(0, 25);
  res.json(top);
});

// ============ COMMANDS VERWALTUNG ============
app.get("/api/commands", requirePermission("commands"), (req, res) => {
  const settings = loadGuildJson(req, "commandSettings.json", {});
  res.json(settings);
});

app.post("/api/commands/:name", requirePermission("commands"), (req, res) => {
  const settings = loadGuildJson(req, "commandSettings.json", {});
  const { active, reason } = req.body;
  settings[req.params.name] = { active: Boolean(active), reason: reason || "", updatedAt: Date.now(), updatedBy: req.session.username };
  saveGuildJsonSync(req, "commandSettings.json", settings);
  res.json({ success: true });
});

// ============ CHANNEL BLACKLIST ============
app.get("/api/channels/blacklist", requirePermission("economy"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  res.json(config.blacklistedChannels || []);
});
app.post("/api/channels/blacklist/:channelId", requirePermission("economy"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  if (!Array.isArray(config.blacklistedChannels)) config.blacklistedChannels = [];
  if (!config.blacklistedChannels.includes(req.params.channelId)) { config.blacklistedChannels.push(req.params.channelId); saveGuildJsonSync(req, "config.json", config); }
  res.json({ success: true });
});
app.delete("/api/channels/blacklist/:channelId", requirePermission("economy"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  if (!Array.isArray(config.blacklistedChannels)) config.blacklistedChannels = [];
  config.blacklistedChannels = config.blacklistedChannels.filter(id => id !== req.params.channelId);
  saveGuildJsonSync(req, "config.json", config); res.json({ success: true });
});

// ============ ROLLEN-VERWALTUNG (nur Admin) ============
app.get("/api/roles", requirePermission("roleManagement"), (req, res) => {
  const config = getRolesConfig();
  const profiles = profileSystem.loadProfiles(req.session?.guildId) || {};
  const uiUsers = Object.values(profiles)
    .filter(p => p && p.discordName)
    .map(p => ({
      username: p.discordName,
      role: config.users[p.discordName]?.role || null,
      discordId: p.discordId,
      mcName: p.mcName
    }));
  res.json({ roles: config.roles, uiUsers });
});

app.post("/api/roles/user/:username/assign", requirePermission("roleManagement"), (req, res) => {
  const { role } = req.body;
  const username = req.params.username;
  if (!role) return res.status(400).json({ error: "role erforderlich" });
  const config = getRolesConfig();
  if (!config.roles[role]) return res.status(400).json({ error: "Unbekannte Rolle" });
  // Prüfe, ob der User ein UI-User ist
  const profiles = profileSystem.loadProfiles(req.session?.guildId);
  const exists = Object.values(profiles).some(p => (p.discordName || "").toLowerCase() === username.toLowerCase());
  if (!exists) return res.status(404).json({ error: "User hat keinen User-Interface Zugang" });
  config.users[username] = { role };
  saveRolesConfig(config);
  writeAudit(req.session.username, "user_role_assign", `Rolle ${role} an ${username} zugewiesen`);
  res.json({ success: true });
});

app.delete("/api/roles/user/:username", requirePermission("roleManagement"), (req, res) => {
  const config = getRolesConfig();
  delete config.users[req.params.username];
  saveRolesConfig(config);
  writeAudit(req.session.username, "user_role_remove", `Rolle von ${req.params.username} entfernt`);
  res.json({ success: true });
});

app.post("/api/roles/role/:roleName/permissions", requirePermission("roleManagement"), (req, res) => {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return res.status(400).json({ error: "permissions muss ein Array sein" });
  const config = getRolesConfig();
  if (!config.roles[req.params.roleName]) return res.status(400).json({ error: "Rolle nicht gefunden" });
  config.roles[req.params.roleName].permissions = permissions;
  saveRolesConfig(config);
  res.json({ success: true });
});

app.post("/api/roles/role", requirePermission("roleManagement"), (req, res) => {
  const { roleName, label } = req.body;
  if (!roleName || typeof roleName !== "string") return res.status(400).json({ error: "roleName erforderlich" });
  const safeName = roleName.trim().toLowerCase().replace(/\s+/g, "_");
  if (!safeName) return res.status(400).json({ error: "Ungültiger Rollen-Name" });
  const config = getRolesConfig();
  if (config.roles[safeName]) return res.status(400).json({ error: "Rolle existiert bereits" });
  config.roles[safeName] = { label: label || roleName, color: "#4DA3FF", permissions: [] };
  saveRolesConfig(config);
  writeAudit(req.session.username, "role_create", `Rolle ${safeName} erstellt`);
  res.json({ success: true, roleName: safeName });
});

app.delete("/api/roles/role/:roleName", requirePermission("roleManagement"), (req, res) => {
  const { roleName } = req.params;
  if (roleName === "owner" || roleName === "admin") return res.status(403).json({ error: "Reservierte Rolle kann nicht gelöscht werden" });
  const config = getRolesConfig();
  if (!config.roles[roleName]) return res.status(404).json({ error: "Rolle nicht gefunden" });
  delete config.roles[roleName];
  Object.keys(config.users).forEach(u => { if (config.users[u]?.role === roleName) delete config.users[u]; });
  saveRolesConfig(config);
  writeAudit(req.session.username, "role_delete", `Rolle ${roleName} gelöscht`);
  res.json({ success: true });
});

// ============ FAQ API ============

app.get("/api/faqs/categories", (req, res) => {
  res.json(faqData.getFaqCategories());
});

app.get("/api/faqs", (req, res) => {
  const { q = "", category = "" } = req.query;
  res.json(faqData.listFaqs({ status: "published", q, category }));
});

app.get("/api/faqs/all", requirePermission("dhbt-faq_access"), (req, res) => {
  const { q = "", category = "" } = req.query;
  res.json(faqData.listAllFaqs({ q, category }));
});

app.get("/api/faqs/item/:id", requirePermission("dhbt-faq_access"), (req, res) => {
  const faq = faqData.getFaq(req.params.id);
  if (!faq) return res.status(404).json({ error: "FAQ nicht gefunden" });
  res.json(faq);
});

app.post("/api/faqs", requirePermission("dhbt-faq_access"), async (req, res) => {
  const username = req.session?.username || "admin";
  const result = faqData.createFaq(req.body, username);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.faq.status === "published") {
    const dc = await faqDiscord.postFaq(result.faq);
    if (dc && dc.threadId) faqData.updateFaqThreadId(result.faq.id, dc.threadId);
  }
  writeAudit(username, "faq_create", `FAQ ${result.faq.id} erstellt: ${result.faq.title}`);
  res.json({ success: true, faq: result.faq });
});

app.put("/api/faqs/item/:id", requirePermission("dhbt-faq_access"), async (req, res) => {
  const username = req.session?.username || "admin";
  const before = faqData.getFaq(req.params.id);
  if (!before) return res.status(404).json({ error: "FAQ nicht gefunden" });
  const result = faqData.updateFaq(req.params.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.faq.discordThreadId) await faqDiscord.updateFaqPost(result.faq);
  writeAudit(username, "faq_edit", `FAQ ${result.faq.id} bearbeitet: ${result.faq.title}`);
  res.json({ success: true, faq: result.faq });
});

app.delete("/api/faqs/item/:id", requirePermission("dhbt-faq_access"), async (req, res) => {
  const username = req.session?.username || "admin";
  const faq = faqData.getFaq(req.params.id);
  if (!faq) return res.status(404).json({ error: "FAQ nicht gefunden" });
  await faqDiscord.closeFaqPost(faq, "deleted");
  faqData.deleteFaq(req.params.id);
  writeAudit(username, "faq_delete", `FAQ ${req.params.id} gelöscht: ${faq.title}`);
  res.json({ success: true });
});

app.post("/api/faqs/item/:id/archive", requirePermission("dhbt-faq_access"), async (req, res) => {
  const username = req.session?.username || "admin";
  const result = faqData.setFaqStatus(req.params.id, "archived");
  if (result.error) return res.status(400).json({ error: result.error });
  const faq = faqData.getFaq(req.params.id);
  if (faq && faq.discordThreadId) await faqDiscord.closeFaqPost(faq, "archived");
  writeAudit(username, "faq_archive", `FAQ ${req.params.id} archiviert: ${faq.title}`);
  res.json({ success: true, faq });
});

app.post("/api/faqs/item/:id/publish", requirePermission("dhbt-faq_access"), async (req, res) => {
  const username = req.session?.username || "admin";
  const result = faqData.setFaqStatus(req.params.id, "published");
  if (result.error) return res.status(400).json({ error: result.error });
  const faq = faqData.getFaq(req.params.id);
  if (faq && !faq.discordThreadId) {
    const dc = await faqDiscord.postFaq(faq);
    if (dc && dc.threadId) faqData.updateFaqThreadId(faq.id, dc.threadId);
  }
  writeAudit(username, "faq_publish", `FAQ ${req.params.id} veröffentlicht: ${faq.title}`);
  res.json({ success: true, faq });
});

app.post("/api/faqs/categories", requirePermission("dhbt-faq_access"), (req, res) => {
  const username = req.session?.username || "admin";
  const result = faqData.createCategory(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  writeAudit(username, "faq_category_create", `FAQ-Kategorie erstellt: ${result.category.name}`);
  res.json({ success: true, category: result.category });
});

app.put("/api/faqs/categories/:id", requirePermission("dhbt-faq_access"), (req, res) => {
  const username = req.session?.username || "admin";
  const result = faqData.updateCategory(req.params.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  writeAudit(username, "faq_category_edit", `FAQ-Kategorie bearbeitet: ${result.category.name}`);
  res.json({ success: true, category: result.category });
});

app.delete("/api/faqs/categories/:id", requirePermission("dhbt-faq_access"), (req, res) => {
  const username = req.session?.username || "admin";
  const result = faqData.deleteCategory(req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  writeAudit(username, "faq_category_delete", `FAQ-Kategorie gelöscht: ${req.params.id}`);
  res.json({ success: true });
});

// ============ BOT STATUS ============
const _startTime = Date.now();
app.get("/api/dashboard-metrics", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.removeHeader("ETag");
  const uptimeMs = Date.now() - _startTime;
  const mem = process.memoryUsage();
  res.json({
    dashboardOnline: true,
    uptimeMs,
    uptimeFormatted: formatUptime(uptimeMs),
    ramMB: Math.round(mem.rss / 1024 / 1024),
    heapMB: Math.round(mem.heapUsed / 1024 / 1024),
    nodeVersion: process.version,
    platform: process.platform,
    botVersion: require("../package.json").version || "1.0.0"
  });
});

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

// ============ AUDIT LOG ============
const AUDIT_FILE = path.join(__dirname, "auditLog.json");
function writeAudit(username, action, details) {
  const log = loadJson(AUDIT_FILE, { entries: [] });
  if (!Array.isArray(log.entries)) log.entries = [];
  log.entries.unshift({ ts: Date.now(), username, action, details });
  if (log.entries.length > 200) log.entries = log.entries.slice(0, 200);
  saveJsonSync(AUDIT_FILE, log);
}

app.get("/api/audit", requirePermission("roleManagement"), (req, res) => {
  const log = loadJson(AUDIT_FILE, { entries: [] });
  res.json(Array.isArray(log.entries) ? log.entries.slice(0, 100) : []);
});

// Audit-Middleware für schreibende Aktionen
const _origPost = app.post.bind(app);

// ============ USER-SUCHE ============
app.get("/api/users/search", requireAuth, (req, res) => {
  const q = (req.query.q || "").toLowerCase();
  if (!q) return res.json([]);
  const cache = loadJson(path.join(DATA_DIR, "userCache.json"), {});
  const coins = loadGuildJson(req, "coins.json", {});
  const xpData = loadGuildJson(req, "xpData.json", {});
  const results = Object.entries(cache)
    .filter(([id, name]) => name.toLowerCase().includes(q) || id.includes(q))
    .slice(0, 10)
    .map(([id, name]) => ({
      userId: id,
      username: name,
      balance: Number(coins[id] || 0),
      level: xpData[id]?.level || 1,
      xp: xpData[id]?.xp || 0
    }));
  res.json(results);
});

// ============ SHOP CRUD ============
app.post("/api/shop/item", requirePermission("shop"), (req, res) => {
  const { id, name, price, description, category } = req.body;
  if (!id || !name || price === undefined) return res.status(400).json({ error: "id, name, price erforderlich" });
  const shop = loadGuildJson(req, "shop.json", { items: [], orders: [] });
  const existing = shop.items.findIndex(i => i.id === id);
  const item = { id, name, price: Number(price), description: description || "", category: category || "general" };
  if (existing >= 0) shop.items[existing] = item;
  else shop.items.push(item);
  saveGuildJsonSync(req, "shop.json", shop);
  writeAudit(req.session.username, "shop_item_save", `${id}: ${name} (${price} Coins)`);
  res.json({ success: true });
});

app.delete("/api/shop/item/:id", requirePermission("shop"), (req, res) => {
  const shop = loadGuildJson(req, "shop.json", { items: [], orders: [] });
  shop.items = shop.items.filter(i => i.id !== req.params.id);
  saveGuildJsonSync(req, "shop.json", shop);
  writeAudit(req.session.username, "shop_item_delete", req.params.id);
  res.json({ success: true });
});

app.post("/api/shop/order/:idx/complete", requirePermission("shop"), (req, res) => {
  const shop = loadGuildJson(req, "shop.json", { items: [], orders: [] });
  const idx = Number(req.params.idx);
  if (!shop.orders[idx]) return res.status(404).json({ error: "Nicht gefunden" });
  shop.orders[idx].completed = true;
  shop.orders[idx].completedAt = Date.now();
  shop.orders[idx].completedBy = req.session.username;
  saveGuildJsonSync(req, "shop.json", shop);
  res.json({ success: true });
});

// ============ WEEKLY RESET ============
app.post("/api/weekly/reset", requirePermission("weekly"), (req, res) => {
  const weekly = loadGuildJson(req, "weeklyMissions.json", {});
  weekly.currentCampaign = null;
  weekly.totalProgress = {};
  weekly.participants = {};
  weekly.completed = {};
  // Sofort neue Campaign für aktuelle Woche erstellen
  const weeklyModule = require("../modules/weeklyMissions");
  const nowMs = Date.now();
  const weeksSinceStart = Math.floor((nowMs - weeklyModule.WEEKLY_START_DATE) / (7 * 24 * 60 * 60 * 1000));
  const currentWeekStart = weeklyModule.WEEKLY_START_DATE + weeksSinceStart * 7 * 24 * 60 * 60 * 1000;
  const index = Math.abs(weeksSinceStart) % weeklyModule.WEEKLY_MISSIONS_POOL.length;
  const selected = weeklyModule.WEEKLY_MISSIONS_POOL[index];
  weekly.currentCampaign = {
    campaignId: `${new Date(currentWeekStart).getFullYear()}-W${weeksSinceStart}`,
    weekIndex: weeksSinceStart,
    weekStart: currentWeekStart,
    selectedMissionId: selected.id,
    selectedMissionMeta: selected,
    startDate: currentWeekStart,
    missions: [selected]
  };
  saveGuildJsonSync(req, "weeklyMissions.json", weekly);
  writeAudit(req.session.username, "weekly_reset", "Weekly Mission zurückgesetzt und neu gestartet");
  res.json({ success: true, campaign: weekly.currentCampaign });
});

// ============ PASSWORT ÄNDERN ============
app.post("/api/account/password", requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const username = req.session.username;
  if (username === "admin") return res.status(400).json({ error: "Master-Admin Passwort nur über .env änderbar" });
  const config = getRolesConfig();
  const user = config.users[username];
  if (!user || user.password !== currentPassword) return res.status(401).json({ error: "Aktuelles Passwort falsch" });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Neues Passwort zu kurz (min. 4 Zeichen)" });
  config.users[username].password = newPassword;
  saveRolesConfig(config);
  writeAudit(username, "password_change", `${username} hat Passwort geändert`);
  res.json({ success: true });
});

// ============ AUDIT bei wichtigen Änderungen ============
const _auditWrap = (route, perm, action) => {
  app.post(route, requirePermission(perm), (req, res, next) => {
    writeAudit(req.session?.username || "?", action, JSON.stringify(req.body).slice(0, 100));
    next();
  });
};

// ============ PROFILE SYSTEM API ============
const PROFILES_FILE = path.join(DATA_DIR, "profiles.json");

function requireProfileAuth(req, res, next) {
  if (req.session && req.session.profileUserId) return next();
  return res.status(401).json({ error: "Nicht eingeloggt", requirePasswordChange: false });
}

app.post("/api/profile/login", (req, res) => {
  const { username, password, rememberMe } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Login und Passwort erforderlich" });

  const profiles = profileSystem.loadProfiles(req.session?.guildId);
  const entry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === username.toLowerCase() || p.discordId === username);
  if (!entry) return res.status(401).json({ error: "Login nicht gefunden" });

  const [userId, profile] = entry;
  if (!profileSystem.validatePassword(req.session?.guildId, userId, password)) {
    return res.status(401).json({ error: "Falsches Passwort" });
  }

  req.session.profileUserId = userId;
  req.session.profileDiscordName = profile.discordName;
  setSessionDuration(req, rememberMe);

  res.json({
    success: true,
    requirePasswordChange: !profile.passwordChanged,
    profile: profileSystem.buildProfileResponse(req.session?.guildId, userId)
  });
});

app.post("/api/profile/logout", (req, res) => {
  req.session.profileUserId = null;
  req.session.profileDiscordName = null;
  res.json({ success: true });
});

app.post("/api/profile/unlink", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const discordName = req.session.profileDiscordName || "ui-user";
  profileSystem.deleteProfileLink(req.session?.guildId, userId);
  writeAudit(discordName, "account_unlink", "MC-DC Verknüpfung über UI-Menü gelöscht");
  if (req.session && typeof req.session.destroy === "function") {
    req.session.destroy(() => {});
  } else {
    req.session.profileUserId = null;
    req.session.profileDiscordName = null;
  }
  res.json({ success: true });
});

app.get("/api/profile/me", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const profile = profileSystem.buildProfileResponse(req.session?.guildId, userId);
  if (!profile) return res.status(404).json({ error: "Profil nicht gefunden" });
  const stats = profileSystem.buildProfileStats(req.session?.guildId, userId);
  const hasDashboardAccess = absenceManager.hasDashboardAccess(profile.discordName);
  const activeAbsence = absenceManager.getActiveAbsence(userId);
  res.json({
    success: true,
    requirePasswordChange: !profile.passwordChanged,
    profile,
    stats,
    hasDashboardAccess,
    activeAbsence
  });
});

// ============ PUBLIC MEMBERS API ============
const MEMBER_ROLE_ORDER = [
  { id: "1406269767534514216", name: "Owner",                     color: "#FF4444" },
  { id: "1406263487998591007", name: "Co-owner",                  color: "#FF5555" },
  { id: "1380553803698409532", name: "DEV",                       color: "#3498DB" },
  { id: "1348742916536799242", name: "Admin",                     color: "#E74C3C" },
  { id: "1422725420989812887", name: "Moderator+",                color: "#E67E22" },
  { id: "1345474719671128074", name: "Moderator",                 color: "#F39C12" },
  { id: "1346918595011285022", name: "Supporter+",                color: "#1ABC9C" },
  { id: "1345495911530369066", name: "Supporter",                 color: "#16A085" },
  { id: "1353788958685007952", name: "Supporter Probe",           color: "#48C9B0" },
  { id: "1521561473900613814", name: "BUG-Team Leitung",          color: "#9B59B6" },
  { id: "1513976519066779648", name: "BUG-Team",                  color: "#8E44AD" },
  { id: "1521561618306039978", name: "Werbung-Team Leitung",      color: "#FF69B4" },
  { id: "1513977510080155698", name: "Werbung-Team",              color: "#C71585" },
  { id: "1521561347576565771", name: "Vorschläge-Team Leitung",   color: "#27AE60" },
  { id: "1513976795756630058", name: "Vorschläge-Team",           color: "#2ECC71" },
  { id: "1346920870261690471", name: "Clan Team",                 color: "#FF8C00" },
  { id: "1380872499390189659", name: "Banditenmeister",           color: "#FFD700" },
  { id: "1459746381949435928", name: "Item Verleih Leitung",      color: "#DAA520" },
  { id: "1459746615333093418", name: "Item Verleih Helfer",       color: "#B8860B" },
  { id: "1428856939991011338", name: "VIP",                       color: "#E91E63" },
  { id: "1345482595818934382", name: "Banditen Builder Leitung",  color: "#00BCD4" },
  { id: "1336642142474600529", name: "BanditenBuilder",           color: "#26C6DA" },
  { id: "1377556656291844157", name: "BanditenBuilder Probe",     color: "#4DD0E1" },
  { id: "1376034065484091454", name: "Banditen Maler Leitung",    color: "#AB47BC" },
  { id: "1346159348984053901", name: "Banditen Maler",            color: "#BA68C8" },
  { id: "1380586519781310495", name: "Farmerleitung",             color: "#66BB6A" },
  { id: "1336396548564713513", name: "BanditenFarmer",            color: "#81C784" },
  { id: "1380596605127889027", name: "BanditenFarmer Probe",      color: "#A5D6A7" },
  { id: "1414776875729027113", name: "RedstoneBandit Leitung",    color: "#EF5350" },
  { id: "1346557171445530715", name: "RedstoneBandit",            color: "#E57373" },
  { id: "1322152686384320534", name: "Server Booster",            color: "#F06292" },
  { id: "1512152687653687406", name: "DHBT+",                     color: "#4DA3FF" },
  { id: "1328856637586276425", name: "Hilfsbandit",                color: "#57F287" },
  { id: "1416471750618910791", name: "Probebandit",                color: "#95A5A6" },
  { id: "1345790116852924569", name: "Clan Freund",                color: "#BDC3C7" },

  // ---------- Testserver Rollen ----------
  { id: "1513338476328652840", name: "Owner (Test)",               color: "#FF4444" },
  { id: "1513338573796151457", name: "Co-owner (Test)",            color: "#FF5555" },
  { id: "1399742875998228582", name: "Admin (Test)",               color: "#E74C3C" },
];

const MEMBERS_BLACKLIST_FILE = path.join(DATA_DIR, "membersBlacklist.json");
function getMembersBlacklist() { return loadJson(MEMBERS_BLACKLIST_FILE, []); }
function saveMembersBlacklist(list) { saveJsonSync(MEMBERS_BLACKLIST_FILE, list); }

async function fetchGuildMembersRest(guildId, token) {
  const https = require("https");
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "discord.com",
      path: `/api/v10/guilds/${guildId}/members?limit=1000`,
      method: "GET",
      headers: { Authorization: `Bot ${token}`, "User-Agent": "DHBT-Dashboard/1.0" }
    }, (r) => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
        try { resolve(r.statusCode === 200 ? JSON.parse(d) : []); }
        catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.end();
  });
}

app.get("/api/members", async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;

    const MAIN_GUILD_ID = process.env.Haupt_GUILD || "1321266417500426290";
    const TEST_GUILD_ID = process.env.TEST_GUILD || "1399740083233488906";
    const DEFAULT_TEST_ROLE = { id: "test", name: "Test-Mitglied", color: "#95A5A6" };

    const seen = new Map();
    let membersRaw = [];

    async function fetchGuild(guildId) {
      if (!guildId) return;

      if (client) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          await guild.members.fetch().catch(() => {});
          for (const [, member] of guild.members.cache) {
            if (member.user.bot) continue;
            if (seen.has(member.id)) continue;
            let topRole = null, topRoleIndex = Infinity;
            for (let i = 0; i < MEMBER_ROLE_ORDER.length; i++) {
              if (member.roles.cache.has(MEMBER_ROLE_ORDER[i].id) && i < topRoleIndex) {
                topRoleIndex = i; topRole = MEMBER_ROLE_ORDER[i];
              }
            }
            if (!topRole) {
              if (guildId !== TEST_GUILD_ID) continue;
              topRole = DEFAULT_TEST_ROLE;
              topRoleIndex = MEMBER_ROLE_ORDER.length;
            }
            const allRoles = guildId === TEST_GUILD_ID
              ? [DEFAULT_TEST_ROLE]
              : MEMBER_ROLE_ORDER.filter(r => member.roles.cache.has(r.id));
            const profile = profileSystem.getProfile(guildId, member.id);
            let finalRole = topRole, finalRoleIndex = topRoleIndex;
            if (profile?.displayRole && member.roles.cache.has(profile.displayRole)) {
              const idx = MEMBER_ROLE_ORDER.findIndex(r => r.id === profile.displayRole);
              if (idx !== -1) { finalRole = MEMBER_ROLE_ORDER[idx]; finalRoleIndex = idx; }
            }
            seen.set(member.id, {
              id: member.id,
              guildId,
              username: member.user.username,
              displayName: member.displayName,
              avatarUrl: member.user.displayAvatarURL({ format: "png", size: 128 }),
              topRole: finalRole,
              topRoleIndex: finalRoleIndex,
              allRoles,
              joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
              mcName: profile?.mcName || null,
              bio: profile?.bio || null,
              skinUrl: profile?.mcLinked && profile?.uuid
                ? (profile.platform === "Bedrock"
                    ? `https://tabavatars.net/avatar/?uuid=${encodeURIComponent(profile.uuid)}&type=head&size=128`
                    : `https://mc-heads.net/head/${profile.uuid}/128`)
                : null,
            });
          }
          return;
        }
      }

      // Fallback: REST API direkt
      if (BOT_TOKEN) {
        const raw = await fetchGuildMembersRest(guildId, BOT_TOKEN);
        for (const member of raw) {
          if (!member.user || member.user.bot) continue;
          if (seen.has(member.user.id)) continue;
          const roleIds = member.roles || [];
          let topRole = null, topRoleIndex = Infinity;
          for (let i = 0; i < MEMBER_ROLE_ORDER.length; i++) {
            if (roleIds.includes(MEMBER_ROLE_ORDER[i].id) && i < topRoleIndex) {
              topRoleIndex = i; topRole = MEMBER_ROLE_ORDER[i];
            }
          }
          if (!topRole) {
            if (guildId !== TEST_GUILD_ID) continue;
            topRole = DEFAULT_TEST_ROLE;
            topRoleIndex = MEMBER_ROLE_ORDER.length;
          }
          const allRoles = guildId === TEST_GUILD_ID
            ? [DEFAULT_TEST_ROLE]
            : MEMBER_ROLE_ORDER.filter(r => roleIds.includes(r.id));
          const profile = profileSystem.getProfile(guildId, member.user.id);
          let finalRole = topRole, finalRoleIndex = topRoleIndex;
          if (profile?.displayRole && roleIds.includes(profile.displayRole)) {
            const idx = MEMBER_ROLE_ORDER.findIndex(r => r.id === profile.displayRole);
            if (idx !== -1) { finalRole = MEMBER_ROLE_ORDER[idx]; finalRoleIndex = idx; }
          }
          const av = member.user.avatar
            ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${Number(member.user.discriminator || 0) % 5}.png`;
          seen.set(member.user.id, {
            id: member.user.id,
            guildId,
            username: member.user.username,
            displayName: member.nick || member.user.global_name || member.user.username,
            avatarUrl: av,
            topRole: finalRole,
            topRoleIndex: finalRoleIndex,
            allRoles,
            joinedAt: member.joined_at || null,
            mcName: profile?.mcName || null,
            bio: profile?.bio || null,
            skinUrl: profile?.mcLinked && profile?.uuid
              ? (profile.platform === "Bedrock"
                  ? `https://tabavatars.net/avatar/?uuid=${encodeURIComponent(profile.uuid)}&type=head&size=128`
                  : `https://mc-heads.net/head/${profile.uuid}/128`)
              : null,
          });
        }
      }
    }

    let targetGuildId = MAIN_GUILD_ID;
    if (client && TEST_GUILD_ID && TEST_GUILD_ID !== MAIN_GUILD_ID) {
      const inMain = await client.guilds.fetch(MAIN_GUILD_ID).then(() => true).catch(() => false);
      if (!inMain) {
        const inTest = await client.guilds.fetch(TEST_GUILD_ID).then(() => true).catch(() => false);
        if (inTest) targetGuildId = TEST_GUILD_ID;
      }
    }

    await fetchGuild(targetGuildId);

    if (seen.size === 0 && TEST_GUILD_ID && TEST_GUILD_ID !== MAIN_GUILD_ID) {
      await fetchGuild(TEST_GUILD_ID);
    }

    const blacklist = getMembersBlacklist();
    const members = Array.from(seen.values()).filter(m => !blacklist.includes(m.id));
    members.sort((a, b) => a.topRoleIndex - b.topRoleIndex || a.displayName.localeCompare(b.displayName));
    res.json(members);
    return;
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/members/blacklist", requirePermission("blacklist"), (req, res) => {
  res.json(getMembersBlacklist());
});

app.post("/api/members/blacklist/:userId", requirePermission("blacklist"), (req, res) => {
  const list = getMembersBlacklist();
  if (!list.includes(req.params.userId)) {
    list.push(req.params.userId);
    saveMembersBlacklist(list);
    writeAudit(req.session.username, "members_blacklist_add", `User ${req.params.userId} auf Mitglieder-Blacklist gesetzt`);
  }
  res.json({ success: true });
});

app.delete("/api/members/blacklist/:userId", requirePermission("blacklist"), (req, res) => {
  const list = getMembersBlacklist().filter(id => id !== req.params.userId);
  saveMembersBlacklist(list);
  writeAudit(req.session.username, "members_blacklist_remove", `User ${req.params.userId} von Mitglieder-Blacklist entfernt`);
  res.json({ success: true });
});

app.post("/api/profile/bio", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const { bio } = req.body;
  if (typeof bio !== "string") return res.status(400).json({ error: "Ungültige Bio" });
  const trimmed = bio.trim().slice(0, 150);
  profileSystem.setProfile(req.session?.guildId, userId, { bio: trimmed });
  res.json({ success: true, bio: trimmed });
});

async function fetchGuildMemberRest(guildId, userId, token) {
  const https = require("https");
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "discord.com",
      path: `/api/v10/guilds/${guildId}/members/${userId}`,
      method: "GET",
      headers: { Authorization: `Bot ${token}`, "User-Agent": "DHBT-Dashboard/1.0" }
    }, (r) => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => {
        try { resolve(r.statusCode === 200 ? JSON.parse(d) : null); }
        catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}

app.get("/api/profile/roles", requireProfileAuth, async (req, res) => {
  try {
    const userId = req.session.profileUserId;
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const BOT_TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
    const MAIN_GUILD_ID = process.env.Haupt_GUILD || "1321266417500426290";
    const TEST_GUILD_ID = process.env.TEST_GUILD || "1399740083233488906";
    const guildIds = [MAIN_GUILD_ID, TEST_GUILD_ID].filter(Boolean);
    const roleIds = new Set();

    for (const guildId of guildIds) {
      let fetched = false;
      if (client) {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (guild) {
          await guild.members.fetch(userId).catch(() => {});
          const member = guild.members.cache.get(userId);
          if (member) {
            for (const id of member.roles.cache.keys()) roleIds.add(id);
            fetched = true;
          }
        }
      }

      // Fallback: REST API, falls Dashboard separat vom Bot läuft
      if (!fetched && BOT_TOKEN) {
        const member = await fetchGuildMemberRest(guildId, userId, BOT_TOKEN);
        if (member && Array.isArray(member.roles)) {
          for (const id of member.roles) roleIds.add(id);
        }
      }
    }

    // Nur Rollen die in MEMBER_ROLE_ORDER bekannt sind
    const mapped = Array.from(roleIds)
      .map(id => {
        const idx = MEMBER_ROLE_ORDER.findIndex(r => r.id === id);
        if (idx === -1) return null;
        return { ...MEMBER_ROLE_ORDER[idx], index: idx };
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index);

    const profile = profileSystem.getProfile(req.session?.guildId, userId);
    res.json({ roles: mapped, displayRole: profile?.displayRole || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/profile/display-role", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const { roleId } = req.body;

  if (roleId === null || roleId === "") {
    profileSystem.setProfile(req.session?.guildId, userId, { displayRole: null });
    return res.json({ success: true, displayRole: null });
  }

  const allowed = MEMBER_ROLE_ORDER.some(r => r.id === roleId);
  if (!allowed) return res.status(400).json({ error: "Ungültige Rolle" });
  profileSystem.setProfile(req.session?.guildId, userId, { displayRole: roleId });
  res.json({ success: true, displayRole: roleId });
});

app.post("/api/profile/change-password", requireProfileAuth, (req, res) => {
  const { newPassword } = req.body;
  const userId = req.session.profileUserId;
  const result = profileSystem.changePassword(req.session?.guildId, userId, newPassword);
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true });
});

// ============ SKIN DEKORATIONEN ============
const SKIN_DECO_FILE = path.join(DATA_DIR, "skinDecorations.json");

app.get("/api/skin-deco", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const data = loadJson(SKIN_DECO_FILE, {});
  res.json(data[userId] || { hand: null, head: null, body: null, effect: null });
});

app.post("/api/skin-deco", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const { hand, head, body, effect } = req.body;
  const data = loadJson(SKIN_DECO_FILE, {});
  data[userId] = { hand: hand || null, head: head || null, body: body || null, effect: effect || null, updatedAt: Date.now() };
  saveJsonSync(SKIN_DECO_FILE, data);
  res.json({ success: true, saved: data[userId] });
});

// ============ ABSENCE / AN-ABMELDUNG ============
app.post("/api/absence", requireProfileAuth, (req, res) => {
  const { start, end, reason, environment } = req.body;
  const userId = req.session.profileUserId;
  const profile = profileSystem.buildProfileResponse(req.session?.guildId, userId);
  if (!profile) return res.status(404).json({ error: "Profil nicht gefunden" });
  const result = absenceManager.createAbsence({
    userId,
    discordName: profile.discordName,
    mcName: profile.mcName,
    start,
    end,
    reason,
    environment: environment || "main"
  });
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true, absence: result.absence });
});

app.post("/api/absence/end", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const { environment } = req.body;
  const result = absenceManager.endAbsence(userId, environment || "main");
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json({ success: true, absence: result.absence });
});

app.get("/api/absence/me", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  res.json({
    active: absenceManager.getActiveAbsence(userId),
    future: absenceManager.getFutureAbsences(userId),
    history: absenceManager.getAbsenceHistory(userId)
  });
});

// ============ DASHBOARD: KARTEN ORDERS ============
app.get("/api/karten/orders", requirePermission("kartenOrders"), (req, res) => {
  const orders = getKartenOrders();
  res.json(orders.map(o => ({
    id: o.id,
    env: o.env,
    orderNumber: o.orderNumber,
    username: o.username,
    mapType: o.mapType,
    filename: o.filename,
    status: o.status,
    createdAt: o.createdAt,
    threadId: o.threadId || null,
    inviteUrl: o.inviteUrl || null,
    error: o.error || null,
    memberId: o.memberId || null
  })));
});

app.post("/api/karten/orders/:id/reset", requirePermission("kartenOrders"), (req, res) => {
  const orders = getKartenOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Bestellung nicht gefunden" });
  order.status = "pending";
  order.error = null;
  delete order.inviteUrl;
  delete order.nextAttemptAt;
  delete order.retryCount;
  saveKartenOrders(orders);
  writeAudit(req.session.username, "karten_order_reset", `Bestellung ${order.orderNumber} zurückgesetzt`);
  res.json({ success: true });
});

app.post("/api/karten/orders/:id/delete", requirePermission("kartenOrders"), (req, res) => {
  const orders = getKartenOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Bestellung nicht gefunden" });
  deleteKartenOrderZip(order.id);
  const remaining = orders.filter(o => o.id !== req.params.id);
  saveKartenOrders(remaining);
  writeAudit(req.session.username, "karten_order_delete", `Bestellung ${order.orderNumber} gelöscht`);
  res.json({ success: true });
});

// ============ DASHBOARD: BUILDER ORDERS / JOBS ============
app.get("/api/builder/orders", requirePermission("builderOrders"), (req, res) => {
  const orders = builderOrders.getOrders();
  res.json(orders.map(o => ({
    id: o.id,
    env: o.env,
    orderNumber: o.orderNumber,
    username: o.username,
    buildType: o.buildType,
    plotSize: o.plotSize,
    schematicAvailable: o.schematicAvailable,
    schematicFilename: o.schematicFilename || null,
    status: o.status,
    createdAt: o.createdAt,
    messageId: o.messageId || null,
    channelId: o.channelId || null,
    inviteUrl: o.inviteUrl || null,
    error: o.error || null,
    memberId: o.memberId || null
  })));
});

app.get("/api/builder/jobs", requirePermission("builderJobs"), (req, res) => {
  const jobs = builderOrders.getJobs();
  res.json(jobs.map(j => ({
    id: j.id,
    env: j.env,
    customerUsername: j.customerUsername,
    buildType: j.buildType,
    plotSize: j.plotSize,
    totalPrice: j.totalPrice,
    maxBuilders: j.maxBuilders,
    pricePerBuilder: j.pricePerBuilder,
    clanShare: j.clanShare || 0,
    schematicAvailable: j.schematicAvailable,
    schematicLink: j.schematicLink || "-",
    additionalInfo: j.additionalInfo || "-",
    notes: j.notes || "-",
    builderUserIds: j.builderUserIds || [],
    createdBy: j.createdBy,
    createdAt: j.createdAt,
    messageId: j.messageId || null,
    channelId: j.channelId || null,
    threadId: j.threadId || null
  })));
});

app.post("/api/builder/orders/:id/reset", requirePermission("builderOrders"), (req, res) => {
  const orders = builderOrders.getOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Bestellung nicht gefunden" });
  order.status = "pending";
  order.error = null;
  delete order.inviteUrl;
  delete order.nextAttemptAt;
  delete order.retryCount;
  builderOrders.saveOrders(orders);
  writeAudit(req.session.username, "builder_order_reset", `Builder-Bestellung ${order.orderNumber} zurückgesetzt`);
  res.json({ success: true });
});

app.post("/api/builder/orders/:id/delete", requirePermission("builderOrders"), (req, res) => {
  const orders = builderOrders.getOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Bestellung nicht gefunden" });
  builderOrders.deleteSchematic(order.id);
  const remaining = orders.filter(o => o.id !== req.params.id);
  builderOrders.saveOrders(remaining);
  writeAudit(req.session.username, "builder_order_delete", `Builder-Bestellung ${order.orderNumber} gelöscht`);
  res.json({ success: true });
});

app.post("/api/builder/jobs/:id/delete", requirePermission("builderJobs"), (req, res) => {
  const jobs = builderOrders.getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: "Auftrag nicht gefunden" });
  const remaining = jobs.filter(j => j.id !== req.params.id);
  builderOrders.saveJobs(remaining);
  writeAudit(req.session.username, "builder_job_delete", `Builder-Auftrag ${job.id} gelöscht`);
  res.json({ success: true });
});

// ============ PROFILE: KARTEN ORDERS ============
app.get("/api/karten/my-orders", requireProfileAuth, (req, res) => {
  const userId = req.session.profileUserId;
  const profile = profileSystem.buildProfileResponse(req.session?.guildId, userId);
  const orders = getKartenOrders();
  const myOrders = orders.filter(o => o.username && o.username.toLowerCase() === (profile?.discordName || "").toLowerCase());
  res.json(myOrders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    mapType: o.mapType,
    status: o.status,
    createdAt: o.createdAt,
    threadId: o.threadId || null,
    inviteUrl: o.inviteUrl || null,
    error: o.error || null
  })));
});

// ============ DASHBOARD: ABSENCE ============
app.get("/api/absences", requirePermission("absenceManagement"), (req, res) => {
  const data = absenceManager.getAbsencesData ? absenceManager.getAbsencesData() : loadJson(path.join(DATA_DIR, "absences.json"), { entries: [] });
  const entries = (data.entries || []).sort((a, b) => b.createdAt - a.createdAt);
  res.json(entries);
});

app.post("/api/absences/:id/acknowledge", requirePermission("absenceManagement"), async (req, res) => {
  const data = absenceManager.getAbsencesData ? absenceManager.getAbsencesData() : loadJson(path.join(DATA_DIR, "absences.json"), { entries: [] });
  const entry = (data.entries || []).find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Abwesenheit nicht gefunden" });
  const client = botStatus.getClient ? botStatus.getClient() : null;
  if (client && entry.userId) {
    try {
      const user = await client.users.fetch(entry.userId).catch(() => null);
      if (user) {
        await user.send({
          content: `Hallo ${entry.discordName || "du"},\n\nWir haben deine ${entry.cancelled ? "Anmeldung" : "Abmeldung"} vom ${absenceManager.formatDate ? absenceManager.formatDate(entry.start) : new Date(entry.start).toLocaleDateString("de-DE")} – ${absenceManager.formatDate ? absenceManager.formatDate(entry.end) : new Date(entry.end).toLocaleDateString("de-DE")} gesehen und bestätigt.\n\nGrund: ${entry.reason || "—"}\n\nViele Grüße,\nDHBT Team`
        });
      }
    } catch (err) {
      console.error("[Absence] DM Fehler:", err.message);
    }
  }
  writeAudit(req.session.username, "absence_acknowledge", `Abwesenheit ${entry.id} bestätigt`);
  res.json({ success: true, dmSent: true });
});

// ============ DASHBOARD: PROBEZEIT ============
app.get("/api/probezeiten", requirePermission("probezeitManagement"), (req, res) => {
  const list = probezeitSystem.getAllProbezeiten();
  res.json(list.map(p => ({
    id: p.id,
    userId: p.userId,
    guildId: p.guildId,
    start: p.start,
    ende: p.ende,
    dauerMs: p.dauerMs,
    zielrolleId: p.zielrolleId,
    remainingMs: probezeitSystem.getRemainingMs(p)
  })));
});

app.post("/api/probezeiten", requirePermission("probezeitManagement"), async (req, res) => {
  const { userId, guildId, dauer, zielrolleId } = req.body;
  if (!userId || !guildId || !dauer || !zielrolleId) {
    return res.status(400).json({ error: "userId, guildId, dauer und zielrolleId erforderlich" });
  }
  const dauerMs = probezeitSystem.parseDauer(dauer);
  if (!dauerMs) return res.status(400).json({ error: "Ungültige Dauer. Format: 7d, 12h, 30m" });
  const entry = probezeitSystem.addProbezeit(userId, guildId, dauerMs, zielrolleId);
  const client = botStatus.getClient ? botStatus.getClient() : null;
  if (client) {
    try {
      probezeitSystem.setClientRef(client);
      probezeitSystem.scheduleProbezeit(entry);
      await probezeitSystem.sendAdminLogEmbed(client, entry, "gestartet", req.session.username || "admin");
    } catch (e) {}
  }
  writeAudit(req.session.username, "probezeit_add", `Probezeit für ${userId} gestartet`);
  res.json({ success: true, entry });
});

app.delete("/api/probezeiten/:id", requirePermission("probezeitManagement"), (req, res) => {
  const list = probezeitSystem.getAllProbezeiten();
  const entry = list.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Probezeit nicht gefunden" });
  probezeitSystem.removeProbezeit(entry.userId, entry.guildId);
  probezeitSystem.clearTimer(entry.userId);
  writeAudit(req.session.username, "probezeit_delete", `Probezeit ${entry.id} gelöscht`);
  res.json({ success: true });
});

app.post("/api/probezeiten/:id/extend", requirePermission("probezeitManagement"), (req, res) => {
  const { additionalDauer } = req.body;
  if (!additionalDauer) return res.status(400).json({ error: "additionalDauer erforderlich" });
  const list = probezeitSystem.getAllProbezeiten();
  const entry = list.find(p => p.id === req.params.id);
  if (!entry) return res.status(404).json({ error: "Probezeit nicht gefunden" });
  const additionalMs = probezeitSystem.parseDauer(additionalDauer);
  if (!additionalMs) return res.status(400).json({ error: "Ungültige Dauer" });
  const updated = probezeitSystem.extendProbezeit(entry.userId, entry.guildId, additionalMs);
  if (!updated) return res.status(500).json({ error: "Verlängerung fehlgeschlagen" });
  const client = botStatus.getClient ? botStatus.getClient() : null;
  if (client) {
    try {
      probezeitSystem.sendAdminLogEmbed(client, updated, "verlängert", req.session.username || "admin").catch(() => {});
    } catch (e) {}
  }
  writeAudit(req.session.username, "probezeit_extend", `Probezeit ${entry.id} verlängert`);
  res.json({ success: true, entry: updated });
});

// ============ DASHBOARD: DAILY REWARDS ============
app.get("/api/daily-rewards/config", requirePermission("dailyRewards"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  res.json({
    dailyMin: Number.isFinite(config.dailyMin) ? config.dailyMin : 25,
    dailyMax: Number.isFinite(config.dailyMax) ? config.dailyMax : 150
  });
});

app.post("/api/daily-rewards/config", requirePermission("dailyRewards"), (req, res) => {
  const config = loadGuildJson(req, "config.json", {});
  const { dailyMin, dailyMax } = req.body;
  if (dailyMin !== undefined) config.dailyMin = Math.max(0, Math.floor(Number(dailyMin)));
  if (dailyMax !== undefined) config.dailyMax = Math.max(0, Math.floor(Number(dailyMax)));
  saveGuildJsonSync(req, "config.json", config);
  writeAudit(req.session.username, "daily_rewards_config_set", "Daily-Rewards Config aktualisiert");
  res.json({ success: true });
});

app.get("/api/daily-rewards/stats", requirePermission("dailyRewards"), (req, res) => {
  const data = loadGuildJson(req, "dailyRewards.json", { users: {} });
  const users = Object.entries(data.users || {});
  const totalClaims = users.reduce((sum, [, u]) => sum + (u.claimCount || 0), 0);
  const topStreak = users.length ? Math.max(...users.map(([, u]) => u.streak || 0)) : 0;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const todayClaims = users.filter(([, u]) => u.lastClaimDate === today).length;
  res.json({ totalUsers: users.length, totalClaims, todayClaims, topStreak, today });
});

app.post("/api/daily-rewards/reset", requirePermission("dailyRewards"), (req, res) => {
  dailyRewards.resetDailyRewardsData();
  writeAudit(req.session.username, "daily_rewards_reset", "Daily-Rewards Daten zurückgesetzt");
  res.json({ success: true });
});

// ============ DASHBOARD: PUBLIC SHOP ============
app.get("/api/public-shop", requirePermission("publicShop"), (req, res) => {
  res.json({
    categories: publicShop.getCategories(),
    items: publicShop.getShopItems()
  });
});

app.post("/api/public-shop/items", requirePermission("publicShop"), (req, res) => {
  const { id, name, category, price, config = {} } = req.body;
  if (!id || !name || !category || price === undefined) {
    return res.status(400).json({ error: "id, name, category und price erforderlich" });
  }
  const item = publicShop.addShopItem(id, name, category, Number(price), config);
  writeAudit(req.session.username, "public_shop_item_add", `Public-Shop Item ${id} hinzugefügt`);
  res.json({ success: true, item });
});

app.put("/api/public-shop/items/:id", requirePermission("publicShop"), (req, res) => {
  const item = publicShop.updateShopItem(req.params.id, req.body);
  if (!item) return res.status(404).json({ error: "Item nicht gefunden" });
  writeAudit(req.session.username, "public_shop_item_update", `Public-Shop Item ${req.params.id} aktualisiert`);
  res.json({ success: true, item });
});

app.delete("/api/public-shop/items/:id", requirePermission("publicShop"), (req, res) => {
  const ok = publicShop.removeShopItem(req.params.id);
  if (!ok) return res.status(404).json({ error: "Item nicht gefunden" });
  writeAudit(req.session.username, "public_shop_item_delete", `Public-Shop Item ${req.params.id} gelöscht`);
  res.json({ success: true });
});


// ============ ACCOUNT UNLINK ============
app.post("/api/account/unlink", requireAuth, async (req, res) => {
  const username = req.session?.username;
  if (!username || username === "admin") return res.status(403).json({ success: false, error: "Nicht erlaubt" });

  const profiles = profileSystem.loadProfiles(req.session?.guildId);
  const entry = Object.entries(profiles).find(([, p]) => (p.discordName || "").toLowerCase() === username.toLowerCase());
  if (!entry) return res.status(404).json({ success: false, error: "Profil nicht gefunden" });

  const [discordId] = entry;
  profileSystem.deleteProfileLink(req.session?.guildId, discordId);
  writeAudit(username, "account_unlink", `MC-DC Verknüpfung gelöscht für ${username}`);

  if (req.session && typeof req.session.destroy === "function") {
    req.session.destroy(() => {});
  } else {
    req.session.loggedIn = false;
    req.session.username = null;
    req.session.role = null;
    req.session.permissions = null;
  }

  res.json({ success: true });
});

// ============ BOARD ============
function getBoardUser(req) {
  const username = req.session?.username || "admin";
  if (username === "admin") return { id: "admin", name: "admin", avatar: null };
  const profiles = profileSystem.loadProfiles(req.session?.guildId);
  for (const [discordId, profile] of Object.entries(profiles)) {
    if ((profile.discordName || "").toLowerCase() === username.toLowerCase()) {
      return { id: discordId, name: profile.discordName || username, avatar: null };
    }
  }
  return { id: username, name: username, avatar: null };
}

function canForceBoardAction(req) {
  const username = req.session?.username || "admin";
  return username === "admin" || hasPermission(username, "dhbt-board_admin") || hasPermission(username, "dhbt-board_edit");
}

app.get("/api/board/cards", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const filter = {
      type: req.query.type,
      status: req.query.status,
      priority: req.query.priority,
      assignee: req.query.assignee,
      labels: req.query.labels ? req.query.labels.split(",") : null,
      search: req.query.search,
    };
    res.json(board.getCards(filter));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/cards/:id", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const card = board.getCard(req.params.id);
    if (!card) return res.status(404).json({ error: "Karte nicht gefunden" });
    res.json(card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.createCard({ ...req.body, creator: user });
    if (!result.success) return res.status(400).json(result);
    writeAudit(user.name, "board_card_created", `${result.card.id} - ${result.card.title}`);
    res.json(result.card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/board/cards/:id", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.updateCard(req.params.id, req.body, user);
    if (!result.success) return res.status(400).json(result);
    writeAudit(user.name, "board_card_updated", `${req.params.id}`);
    res.json(result.card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/board/cards/:id", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.deleteCard(req.params.id, user);
    if (!result.success) return res.status(404).json(result);
    writeAudit(user.name, "board_card_deleted", `${req.params.id}`);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/move", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.moveCard(req.params.id, req.body.status, user);
    if (!result.success) return res.status(400).json(result);
    writeAudit(user.name, "board_card_moved", `${req.params.id} → ${req.body.status}`);
    res.json(result.card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/claim", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const force = req.body.force === true && canForceBoardAction(req);
    const result = board.claimCard(req.params.id, user, force);
    if (!result.success) return res.status(400).json(result);
    writeAudit(user.name, "board_card_claimed", `${req.params.id} von ${user.name}${force ? " (Admin-Override)" : ""}`);
    res.json(result.card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/unclaim", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.unclaimCard(req.params.id, user, canForceBoardAction(req));
    if (!result.success) return res.status(400).json(result);
    writeAudit(user.name, "board_card_unclaimed", `${req.params.id}`);
    res.json(result.card);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/cards/:id/comments", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const card = board.getCard(req.params.id);
    if (!card) return res.status(404).json({ error: "Karte nicht gefunden" });
    res.json({ comments: card.comments || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/comments", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.addComment(req.params.id, req.body, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/board/cards/:id/comments/:commentId", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    user.admin = canForceBoardAction(req);
    const result = board.editComment(req.params.id, req.params.commentId, req.body.text, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/board/cards/:id/comments/:commentId", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    user.admin = canForceBoardAction(req);
    const result = board.deleteComment(req.params.id, req.params.commentId, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/checklists", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.addChecklist(req.params.id, req.body.title, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/checklists/:clId/items", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.addChecklistItem(req.params.id, req.params.clId, req.body.text, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/checklists/:clId/items/:itemId/toggle", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.toggleChecklistItem(req.params.id, req.params.clId, req.params.itemId, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/board/cards/:id/checklists/:clId/items/:itemId", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.removeChecklistItem(req.params.id, req.params.clId, req.params.itemId, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/cards/:id/attachments", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.addAttachment(req.params.id, req.body, user);
    if (!result.success) return res.status(400).json(result);
    writeAudit(user.name, "board_attachment_added", `${req.params.id}`);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/board/cards/:id/attachments/:attId", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.removeAttachment(req.params.id, req.params.attId, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/filters", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    res.json({ filters: board.getSavedFilters(user) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/filters", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.saveFilter(req.body.name, req.body.filter, user);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/board/filters/:name", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const result = board.deleteFilter(req.params.name, user);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/stats", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    res.json(board.getStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/guilds", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    res.json([
      { id: boardConfig.MAIN_GUILD, name: "DHBT Hauptserver" },
      { id: boardConfig.TEST_GUILD, name: "DHBT Testserver" }
    ]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/changelog", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    res.json(board.getChangelogPreview(req.query.type));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/changelog/draft", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    res.json({ content: board.getChangelogDraft(req.query.id || "default") });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/changelog/draft", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    board.saveChangelogDraft(req.body.id || "default", req.body.content);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/changelog/send", requirePermission("dhbt-board_access"), async (req, res) => {
  try {
    const { type, guild, publishOnly } = req.body || {};
    const preview = board.getChangelogPreview(type);

    if (!preview.features.length && !preview.bugfixes.length) {
      return res.status(400).json({ error: "Keine Karten im Status 'fixed_next' / 'live_next' gefunden. Es gibt nichts zu veröffentlichen." });
    }

    // If publishOnly: skip Discord send, just move cards to live (embed builder already sent the message)
    if (publishOnly) {
      const moved = board.publishToLive(type);
      const user = getBoardUser(req);
      writeAudit(user.name, "board_changelog_sent", `${moved.length} Karten veröffentlicht (${type || "alle"}) — via Embed Builder`);
      res.json({ success: true, moved: moved.map(c => c.id) });
      return;
    }

    const client = botStatus.getClient ? botStatus.getClient() : null;
    const guildId = guild || boardConfig.MAIN_GUILD;
    const cfg = boardConfig.getBoardConfig(guildId);

    if (!cfg.updateChannel) {
      return res.status(400).json({ error: "Kein Update-Channel für diesen Server konfiguriert." });
    }

    const fields = [];
    if (preview.features.length) {
      const value = preview.features.map(c => `• **[Feature]** ${c.title}\n  *${c.summary}*`).join("\n").slice(0, 1024);
      fields.push({ name: "🟢 Neue Features", value });
    }
    if (preview.bugfixes.length) {
      const value = preview.bugfixes.map(c => `• **[Bug]** ${c.title}\n  *${c.summary}*`).join("\n").slice(0, 1024);
      fields.push({ name: "🔴 Behobene Bugs", value });
    }
    const embed = {
      title: preview.title,
      color: 0x4DA3FF,
      fields,
      timestamp: new Date().toISOString(),
    };
    const pingRole = cfg.updatePingRole ? `<@&${cfg.updatePingRole}>` : "";
    const payload = { content: `${pingRole} 🚀 ${preview.title}`.trim(), embeds: [embed] };
    let posted = false;
    let sendError = null;
    if (client) {
      try {
        const channel = await client.channels.fetch(cfg.updateChannel).catch(() => null);
        if (channel && typeof channel.send === "function") {
          await channel.send(payload);
          posted = true;
        }
      } catch (e) {
        sendError = e.message;
      }
    }
    if (!posted) {
      const token = boardConfig.getBotToken(guildId);
      if (token) {
        try {
          await embedBuilder.discordApiRequest(token, "POST", `/channels/${cfg.updateChannel}/messages`, payload);
          posted = true;
        } catch (e) {
          sendError = e.message;
        }
      }
    }

    if (!posted) {
      return res.status(500).json({ error: `Changelog konnte nicht gesendet werden: ${sendError || "Bot nicht verbunden und kein Token verfügbar"}` });
    }

    const moved = board.publishToLive(type);
    const user = getBoardUser(req);
    writeAudit(user.name, "board_changelog_sent", `${moved.length} Karten veröffentlicht (${type || "alle"})`);
    res.json({ success: true, moved: moved.map(c => c.id), posted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/board/export", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const { type, format } = req.query;
    const data = board.exportCards(type || null, (format || "json").toLowerCase());
    if ((format || "json").toLowerCase() === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="board-${currentDate()}.csv"`);
      return res.send(data);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/board/import", requirePermission("dhbt-board_access"), (req, res) => {
  try {
    const user = getBoardUser(req);
    const { cards } = req.body || {};
    if (!Array.isArray(cards) || !cards.length) {
      return res.status(400).json({ error: "Keine Karten im Import" });
    }
    const result = board.importCards(cards, user);
    if (result.count) writeAudit(user.name, "board_import", `${result.count} Karten importiert`);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ EMBED BUILDER ============
app.get("/api/embed/guilds", requirePermission("dhbt-embed_builder"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const guilds = await embedBuilder.getGuilds(client);
    res.json({ guilds });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/embed/channels", requirePermission("dhbt-embed_builder"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const channels = await embedBuilder.getTextChannels(client, req.query.guildId || boardConfig.MAIN_GUILD);
    res.json({ channels });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/embed/roles", requirePermission("dhbt-embed_builder"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const roles = await embedBuilder.getRoles(client, req.query.guildId || boardConfig.MAIN_GUILD);
    res.json({ roles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/embed/send", requirePermission("dhbt-embed_builder"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const result = await embedBuilder.sendEmbed(client, req.body || {});
    const user = getBoardUser(req);
    const targets = (result.results || []).map(r => r.target + (r.id ? `:${r.id}` : '') + (r.error ? `(${r.error})` : '')).join(', ');
    writeAudit(user.name, "embed_sent", `Embed gesendet: ${targets || result.target}`);
    res.json({ success: true, result });
  } catch (e) {
    console.error("[EMBED_SEND] Fehler:", e);
    res.status(500).json({ error: e.message, details: e.stack });
  }
});


// ============ ABSTIMMUNGEN ============
app.get("/api/polls/channels", requirePermission("pollManagement"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const channels = await embedBuilder.getTextChannels(client, req.session.guildId);
    res.json({ channels });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/polls/roles", requirePermission("pollManagement"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const roles = await embedBuilder.getRoles(client, req.session.guildId);
    res.json({ roles });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/polls", requirePermission("pollManagement"), async (req, res) => {
  try {
    const polls = pollSystem.list(req.session.guildId);
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const result = [];
    for (const poll of polls) {
      const out = { ...poll };
      // Nur bei geheimer Abstimmung werden personenbezogene Abstimmungsdaten
      // an das Team-Dashboard ausgeliefert.
      if (poll.secret) {
        out.voterDetails = [];
        for (const v of poll.voterDetails || []) {
          let name = v.userId;
          if (client) {
            const user = await client.users.fetch(v.userId).catch(() => null);
            if (user) name = user.globalName || user.displayName || user.username || v.userId;
          }
          out.voterDetails.push({ userId: v.userId, username: name, choices: v.choices });
        }
      } else {
        delete out.voterDetails;
      }
      delete out.votes;
      result.push(out);
    }
    res.json({ polls: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/polls", requirePermission("pollManagement"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    if (!client) return res.status(503).json({ error: "Bot-Client nicht verbunden" });
    const input = req.body || {};
    const poll = await pollSystem.create(client, req.session.guildId, {
      ...input,
      createdBy: req.session.username || "dashboard"
    });
    writeAudit(req.session.username || "admin", "poll_created", `Abstimmung erstellt: ${poll.title} (${poll.id})`);
    res.json({
      success: true,
      poll: {
        id: poll.id,
        messageId: poll.messageId,
        channelId: poll.channelId,
        endsAt: poll.endsAt
      }
    });
  } catch (e) {
    console.error("[POLL] Erstellung fehlgeschlagen:", e);
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/polls/:id/end", requirePermission("pollManagement"), async (req, res) => {
  try {
    const client = botStatus.getClient ? botStatus.getClient() : null;
    const poll = await pollSystem.finish(client, req.session.guildId, req.params.id);
    if (!poll) return res.status(404).json({ error: "Abstimmung nicht gefunden oder bereits beendet" });
    writeAudit(req.session.username || "admin", "poll_finished", `Abstimmung beendet: ${poll.title} (${poll.id})`);
    res.json({ success: true, poll: { id: poll.id, counts: poll.counts, winners: poll.winners } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function currentDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

// Auto-Archive Live-Karten stündlich
setInterval(() => board.autoArchiveLiveCards(), 60 * 60 * 1000);

// ============ TICKET SYSTEM API ============

// Helper: send panel via HTTP API when bot client is not available
async function sendPanelViaHttp(channelId, guildId) {
  const { MAIN_GUILD, TEST_GUILD, getBotToken } = boardConfig;
  const categories = await ticketDB.getAllCategories();
  const embed = {
    title: "🎫 Ticket System",
    description: "Wähle eine Kategorie unten, um ein Ticket zu eröffnen.",
    color: 0x4DA3FF,
    fields: categories.length ? categories.map(c => ({
      name: `${c.emoji || "🎫"} ${c.name}`,
      value: c.description || "Keine Beschreibung",
      inline: false
    })) : [{ name: "Keine Kategorien", value: "Aktuell sind keine Kategorien konfiguriert.", inline: false }],
    footer: { text: "DHBT Ticket System" },
    timestamp: new Date().toISOString()
  };
  const components = [];
  let row = { type: 1, components: [] };
  for (let i = 0; i < categories.length; i++) {
    if (i > 0 && i % 5 === 0) { components.push(row); row = { type: 1, components: [] }; }
    row.components.push({
      type: 2, custom_id: `ticket_open:${categories[i].id}`,
      label: categories[i].name.slice(0, 80),
      emoji: categories[i].emoji ? { name: categories[i].emoji } : undefined,
      style: 1
    });
  }
  if (row.components.length) components.push(row);

  const payload = { embeds: [embed] };
  if (components.length) payload.components = components;

  const existingMsgId = await ticketDB.getConfig("panelMessageId");
  const guildsToTry = [guildId, TEST_GUILD, MAIN_GUILD].filter(Boolean);
  const triedGuilds = new Set();
  for (const gid of guildsToTry) {
    if (triedGuilds.has(gid)) continue;
    triedGuilds.add(gid);
    const token = getBotToken(gid);
    if (!token) { console.error(`[TICKET] No token for guild ${gid}`); continue; }
    try {
      if (existingMsgId) {
        await embedBuilder.discordApiRequest(token, "PATCH", `/channels/${channelId}/messages/${existingMsgId}`, payload);
        await ticketDB.setConfig("panelChannelId", channelId);
        await ticketDB.setConfig("panelGuildId", gid);
        await ticketDB.setConfig("panelMessageId", existingMsgId);
        return { messageId: existingMsgId, channelId, updated: true };
      }
      const result = await embedBuilder.discordApiRequest(token, "POST", `/channels/${channelId}/messages`, payload);
      if (!result || !result.id) throw new Error("Keine Message-ID zurückbekommen");
      await ticketDB.setConfig("panelChannelId", channelId);
      await ticketDB.setConfig("panelGuildId", gid);
      await ticketDB.setConfig("panelMessageId", result.id);
      return { messageId: result.id, channelId, updated: false };
    } catch (e) {
      console.error(`[TICKET] Panel send failed for guild ${gid}:`, e.message);
    }
  }
  throw new Error("Panel konnte nicht gesendet werden. Prüfe Console für Details. Channel-ID korrekt? Bot im Server?");
}

// Panel config
app.get("/api/tickets/panel/config", requirePermission("roleManagement"), async (req, res) => {
  try {
    const channelId = await ticketDB.getConfig("panelChannelId");
    const messageId = await ticketDB.getConfig("panelMessageId");
    const guildId = await ticketDB.getConfig("panelGuildId");
    res.json({ channelId, messageId, guildId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/tickets/panel/send", requirePermission("roleManagement"), async (req, res) => {
  try {
    const { channelId, guildId } = req.body || {};
    if (!channelId) return res.status(400).json({ error: "Channel-ID erforderlich" });
    const client = botStatus.getClient ? botStatus.getClient() : null;
    let result;
    if (client) {
      try { result = await ticketSystem.sendPanel(client, channelId, guildId); }
      catch (e) { console.error("[TICKET] Bot client panel send failed:", e.message); result = null; }
    }
    if (!result) {
      result = await sendPanelViaHttp(channelId, guildId);
    }
    res.json({ success: true, ...result });
  } catch (e) { console.error("[TICKET] Panel send error:", e); res.status(500).json({ error: e.message }); }
});

app.post("/api/tickets/panel/update", requirePermission("roleManagement"), async (req, res) => {
  try {
    const channelId = await ticketDB.getConfig("panelChannelId");
    if (!channelId) return res.status(400).json({ error: "Kein Panel konfiguriert" });
    const client = botStatus.getClient ? botStatus.getClient() : null;
    if (client) {
      try { await ticketSystem.updatePanel(client); return res.json({ success: true }); }
      catch (e) { console.error("[TICKET] Bot client panel update failed:", e.message); }
    }
    // HTTP fallback
    const guildId = await ticketDB.getConfig("panelGuildId");
    await sendPanelViaHttp(channelId, guildId);
    res.json({ success: true });
  } catch (e) { console.error("[TICKET] Panel update error:", e); res.status(500).json({ error: e.message }); }
});

// Categories CRUD
app.get("/api/tickets/categories", requirePermission("roleManagement"), async (req, res) => {
  try {
    const categories = await ticketDB.getAllCategories();
    res.json({ categories });
  } catch (e) { console.error("[TICKET] Get categories error:", e); res.status(500).json({ error: e.message }); }
});

app.post("/api/tickets/categories", requirePermission("roleManagement"), async (req, res) => {
  try {
    const cat = await ticketDB.createCategory(req.body || {});
    res.json({ success: true, category: cat });
  } catch (e) { console.error("[TICKET] Create category error:", e); res.status(500).json({ error: e.message }); }
});

app.put("/api/tickets/categories/:id", requirePermission("roleManagement"), async (req, res) => {
  try {
    const cat = await ticketDB.updateCategory(req.params.id, req.body || {});
    if (!cat) return res.status(404).json({ error: "Kategorie nicht gefunden" });
    res.json({ success: true, category: cat });
  } catch (e) { console.error("[TICKET] Update category error:", e); res.status(500).json({ error: e.message }); }
});

app.delete("/api/tickets/categories/:id", requirePermission("roleManagement"), async (req, res) => {
  try {
    await ticketDB.deleteCategory(req.params.id);
    res.json({ success: true });
  } catch (e) { console.error("[TICKET] Delete category error:", e); res.status(500).json({ error: e.message }); }
});

// Tickets list
app.get("/api/tickets", requirePermission("roleManagement"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    if (req.query.claimedBy) filter.claimedBy = req.query.claimedBy;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.limit) filter.limit = parseInt(req.query.limit, 10);
    const tickets = await ticketDB.getAllTickets(filter);
    res.json({ tickets });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/tickets/:id", requirePermission("roleManagement"), async (req, res) => {
  try {
    const ticket = await ticketDB.getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket nicht gefunden" });
    const [logs, messages] = await Promise.all([
      ticketDB.getLogs(req.params.id),
      ticketDB.getMessages(req.params.id)
    ]);
    res.json({ ticket, logs, messages });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/tickets/:id/close", requirePermission("roleManagement"), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const user = getBoardUser(req);
    const ticket = await ticketDB.updateTicket(req.params.id, {
      status: "closed",
      closedAt: Date.now(),
      closedBy: user.name,
      closedByName: user.name,
      closeReason: reason || "Geschlossen über Dashboard"
    });
    if (!ticket) return res.status(404).json({ error: "Ticket nicht gefunden" });
    await ticketDB.addLog(req.params.id, "closed", "dashboard", user.name, reason || "");
    res.json({ success: true, ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/tickets/:id/rename", requirePermission("roleManagement"), async (req, res) => {
  try {
    const { newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: "Neuer Name erforderlich" });
    const ticket = await ticketDB.getTicket(req.params.id);
    if (!ticket) return res.status(404).json({ error: "Ticket nicht gefunden" });
    const user = getBoardUser(req);
    const fullNewName = `ticket-${ticket.id.split("_")[1].slice(-5)}-${newName.trim().replace(/\s+/g, "-")}`.slice(0, 100);
    const renameHistory = ticket.renameHistory || [];
    renameHistory.push({ from: ticket.threadName, to: fullNewName, by: user.name, at: Date.now() });
    await ticketDB.updateTicket(req.params.id, { threadName: fullNewName, renameHistory });
    await ticketDB.addLog(req.params.id, "renamed", "dashboard", user.name, `"${ticket.threadName}" → "${fullNewName}"`);
    res.json({ success: true, threadName: fullNewName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/tickets/:id/logs", requirePermission("roleManagement"), async (req, res) => {
  try {
    const logs = await ticketDB.getLogs(req.params.id);
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stats
app.get("/api/tickets/stats", requirePermission("roleManagement"), async (req, res) => {
  try {
    const all = await ticketDB.getAllTickets({});
    const open = all.filter(t => t.status === "open" || t.status === "claimed").length;
    const closed = all.filter(t => t.status === "closed").length;
    const claimed = all.filter(t => t.status === "claimed").length;
    const byCategory = {};
    for (const t of all) { byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + 1; }
    const categories = await ticketDB.getAllCategories();
    const categoryStats = categories.map(c => ({ id: c.id, name: c.name, emoji: c.emoji, count: byCategory[c.id] || 0 }));
    res.json({ total: all.length, open, closed, claimed, categoryStats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ SSE: Real-Time Board Sync ============
const boardSSEClients = new Set();

app.get("/api/board/sse", requirePermission("dhbt-board_access"), (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("data: " + JSON.stringify({ type: "connected" }) + "\n\n");
  boardSSEClients.add(res);
  const keepAlive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch (e) { clearInterval(keepAlive); }
  }, 30000);
  req.on("close", () => {
    boardSSEClients.delete(res);
    clearInterval(keepAlive);
  });
});

function broadcastBoardEvent(event) {
  const msg = "data: " + JSON.stringify(event) + "\n\n";
  for (const client of boardSSEClients) {
    try { client.write(msg); } catch (e) { boardSSEClients.delete(client); }
  }
}

// Hook into board save to broadcast changes
const _originalBoardSave = board.saveData;
board.saveData = function(data) {
  _originalBoardSave(data);
  broadcastBoardEvent({ type: "board_update", ts: Date.now() });
};

// ============ START ============
// Migration: Kopiere globale roles.json in Guild-Ordner (falls noch nicht vorhanden)
function migrateGuildData() {
  const { ALLOWED_GUILDS } = require("../modules/config");
  const globalRoles = getRolesConfig();
  for (const guildId of ALLOWED_GUILDS) {
    if (!guildId) continue;
    ensureGuildDataDir(guildId);
    const guildRolesFile = GUILD_ROLES_FILE(guildId);
    if (!fs.existsSync(guildRolesFile)) {
      // Kopiere globale Rollen als Startpunkt
      saveJsonSync(guildRolesFile, JSON.parse(JSON.stringify(globalRoles)));
      console.log(`[DASHBOARD] Guild ${guildId}: roles.json aus globaler Datei migriert`);
    }
  }
}
try { migrateGuildData(); } catch (e) { console.error("[DASHBOARD] Migration error:", e.message); }

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[DASHBOARD] Läuft auf http://localhost:${PORT} und http://0.0.0.0:${PORT}`);
  if (DASHBOARD_DOMAIN) console.log(`[DASHBOARD] Domain: https://${DASHBOARD_DOMAIN}`);
});

module.exports = app;
