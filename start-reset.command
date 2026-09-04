#!/bin/bash
# Re:SET – Ein-Klick-Starter für macOS.
# Doppelklick im Finder startet die App und öffnet sie im Browser.
# Beim ersten Start werden Abhängigkeiten installiert und die App gebaut.

# Immer im Ordner dieses Skripts arbeiten (egal von wo gestartet).
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-3001}"
URL="http://localhost:$PORT"

echo "=============================================="
echo "  Re:SET wird gestartet ..."
echo "=============================================="

# Finder startet dieses Skript ohne deine Shell-Konfiguration, daher ist Node
# per nvm/Homebrew hier nicht automatisch im PATH. Diese Quellen selbst laden.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # nvm laden und die Default-Version aktivieren (ohne Ausgabe-Rauschen).
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1
fi
# Homebrew-Pfade als Fallback anhängen (Apple Silicon + Intel).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Node vorhanden?
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  FEHLER: Node.js ist nicht installiert."
  echo "  Bitte von https://nodejs.org (Version 20+) installieren und erneut starten."
  echo
  read -n 1 -s -r -p "  Taste drücken zum Schließen ..."
  exit 1
fi

# Abhängigkeiten installieren, falls noch nicht geschehen.
if [ ! -d "node_modules" ]; then
  echo "  Installiere Abhängigkeiten (nur beim ersten Mal) ..."
  npm install || { echo "  npm install fehlgeschlagen."; read -n 1 -s -r; exit 1; }
fi

# App bauen, damit der aktuelle Stand ausgeliefert wird.
# Wandert die Platte zwischen Mac und Windows, passen die plattform-spezifischen
# Pakete (z. B. rollup/esbuild) nicht mehr -> bei Fehler einmal neu installieren.
echo "  Baue App ..."
if ! npm run build; then
  echo "  Build fehlgeschlagen -> installiere Pakete fuer diesen Rechner neu ..."
  rm -rf node_modules
  npm install || { echo "  npm install fehlgeschlagen."; read -n 1 -s -r; exit 1; }
  npm run build || { echo "  Build weiterhin fehlgeschlagen."; read -n 1 -s -r; exit 1; }
fi

# Browser kurz nach dem Serverstart öffnen.
( sleep 2 && open "$URL" ) &

echo
echo "  Läuft auf $URL  (dieses Fenster offen lassen)"
echo "  Zum Beenden: dieses Fenster schließen oder Strg+C."
echo
export PORT
node scripts/server.mjs
