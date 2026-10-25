#!/usr/bin/env bash
# Локальный запуск Falcon News Studio v8: студия + runner. Остановка — Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")"

[[ -f .dev.vars ]] || { echo "Нет .dev.vars — скопируйте .dev.vars.example и заполните (см. docs/V8-DEPLOY.md)."; exit 1; }
[[ -f deploy/production-runner/.env ]] || { echo "Нет deploy/production-runner/.env (STUDIO_URL, PRODUCTION_RUNNER_TOKEN, PIXABAY_API_KEY)."; exit 1; }

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh" && nvm use 24.19.0 >/dev/null
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

echo "→ Миграции локальной базы"
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.local.jsonc --persist-to .wrangler/state >/dev/null

mkdir -p .wrangler/logs
echo "→ Студия"
corepack pnpm dev > .wrangler/logs/studio.log 2>&1 &
STUDIO=$!
trap 'echo; echo "Останавливаю…"; kill $STUDIO ${RUNNER:-} 2>/dev/null || true; wait 2>/dev/null; echo "Остановлено."' EXIT INT TERM
until curl -s -o /dev/null http://127.0.0.1:5173/; do
  kill -0 $STUDIO 2>/dev/null || { echo "Студия не запустилась, см. .wrangler/logs/studio.log"; exit 1; }
  sleep 1
done

echo "→ Runner"
(cd deploy/production-runner && set -a && . ./.env && set +a && exec .venv/bin/python runner.py) > .wrangler/logs/runner.log 2>&1 &
RUNNER=$!

cat <<EOF

Falcon News Studio v8 работает.
  Откройте: http://127.0.0.1:5173/signin-with-chatgpt?return_to=/?view=radar
  Логи:     .wrangler/logs/studio.log, .wrangler/logs/runner.log
  Остановка: Ctrl+C в этом окне.
EOF
wait $STUDIO
