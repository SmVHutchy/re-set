@echo off
REM Re:SET - Ein-Klick-Starter fuer Windows.
REM Doppelklick startet die App und oeffnet sie im Browser.
REM Beim ersten Start werden Abhaengigkeiten installiert und die App gebaut.

setlocal
cd /d "%~dp0"

if not defined PORT set PORT=3001
set URL=http://localhost:%PORT%

echo ==============================================
echo   Re:SET wird gestartet ...
echo ==============================================

REM Node vorhanden?
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   FEHLER: Node.js ist nicht installiert.
  echo   Bitte von https://nodejs.org ^(Version 20+^) installieren und erneut starten.
  echo.
  pause
  exit /b 1
)

REM Abhaengigkeiten installieren, falls noch nicht geschehen.
if not exist "node_modules" (
  echo   Installiere Abhaengigkeiten ^(nur beim ersten Mal^) ...
  call npm install || (echo   npm install fehlgeschlagen. & pause & exit /b 1)
)

REM App bauen, damit der aktuelle Stand ausgeliefert wird.
REM Wandert die Platte zwischen Windows und Mac, passen die plattform-spezifischen
REM Pakete (z. B. rollup/esbuild) nicht mehr -^> bei Fehler einmal neu installieren.
echo   Baue App ...
call npm run build
if errorlevel 1 (
  echo   Build fehlgeschlagen -^> installiere Pakete fuer diesen Rechner neu ...
  rmdir /s /q node_modules
  call npm install || (echo   npm install fehlgeschlagen. & pause & exit /b 1)
  call npm run build || (echo   Build weiterhin fehlgeschlagen. & pause & exit /b 1)
)

REM Browser kurz nach dem Serverstart oeffnen.
start "" cmd /c "timeout /t 2 >nul & start %URL%"

echo.
echo   Laeuft auf %URL%  (dieses Fenster offen lassen)
echo   Zum Beenden: dieses Fenster schliessen oder Strg+C.
echo.
node scripts\server.mjs

endlocal
