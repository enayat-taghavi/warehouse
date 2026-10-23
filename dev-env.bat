@echo off
title Warehouse Development Environment
wt -w _new -d "%~dp0backend" cmd /k "title Backend Daphne && .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ; split-pane -d "%~dp0frontend" cmd /k "title Frontend SSR && npm run build && node server.js" ; split-pane -d "%~dp0." cmd /k "title Cloudflare Tunnel && npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse" ; split-pane -d "%~dp0frontend" cmd /k "title Frontend Dev && npm run start -- --port 4300"
