# DHBT-CORE-Experimental

## Beschreibung
Experimentelle Version des DHBT Discord Bot Cores mit erweiterten Features für Poll-System, Gamification, und Community Management.

## Features
- 🗳️ **Poll System**: Discord-basierte anonyme Abstimmungen
- 💰 **Economy System**: Coins, Rewards, und Leaderboards
- 🎮 **Mini-Games**: SSP, Duell, TicTacToe, Slots, Würfeln
- 📊 **XP/Level System**: Mit Prestige-System
- 📝 **Daily/Weekly Missions**: Gamifizierte Aufgaben
- 🎁 **Daily Rewards**: Automatische tägliche Belohnungen
- 👤 **Profile System**: Personalisierte User-Profile
- 🎫 **Ticket System**: Support-Ticket Management
- 📦 **Orders System**: Karten- und Builder-Aufträge

## Installation
```bash
npm install
node index.js
```

## Konfiguration
Siehe `config.js` für Umgebungsvariablen und Einstellungen.

## Fehlerbehandlung
✅ Alle kritischen Fehler wurden korrigiert:
- Null-Safety bei API-Calls
- Type-Checks für Arrays und Objekte
- Fehlerbehandlung in async/await Code
- Math.max() mit leeren Arrays
- Validierung von Benutzereingaben
