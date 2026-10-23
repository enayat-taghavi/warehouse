@echo off
title Warehouse Services (Internal Terminal)

npx concurrently --kill-others --prefix-colors "green,blue,magenta,cyan" --names "BACKEND,SSR,TUNNEL,DEV" ^
  "cd /d \"%~dp0backend\" && .\venv\Scripts\python.exe -m daphne -b 0.0.0.0 -p 8000 config.asgi:application" ^
  "cd /d \"%~dp0frontend\" && npm run build && node server.js" ^
  "cd /d \"%~dp0.\" && npx cloudflared tunnel run --protocol http2 --url http://localhost:4200 warehouse" ^
  "cd /d \"%~dp0frontend\" && npm run start -- --port 4300"
