# Развёртывание v8

Порядок для существующего сайта v7. Перед обновлением сделайте резервные копии D1 и R2 и защищённо сохраните текущий `PROVIDER_ENCRYPTION_KEY`.

## 1. Проверки исходников

Node.js 24.19.0, pnpm 11.25.0 (из `packageManager`):

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs     # 50 тестов
pnpm run build
```

## 2. Публикация в Sites

Как в `DEPLOY-RU.md` v7, раздел «Для доработанного исходника»: перенести изменения в репозиторий Sites штатным source helper, выполнить проверки и build, сделать commit/push/package, сохранить и опубликовать **новую** версию. Не создавайте новый Site.

- Миграция `0007` входит в сборку и только добавляет таблицы. Дождитесь успешного применения миграций до доступа пользователей.
- Добавьте secrets `YOUTUBE_CLIENT_ID` и `YOUTUBE_CLIENT_SECRET`, если нужен YouTube (`V8-CONFIGURATION.md`).
- Аудиторию сайта не меняйте. При owner-private аудитории внешнему runner нужен поддержанный сервисный доступ — как и в v7.

Откат: остановите runner, разверните предыдущую сохранённую версию. Таблицы `0007` не удаляйте — старая версия их не использует.

## 3. Runner (обязателен для монтажа и автопилота)

Без runner радар показывает истории и создаёт сценарии вручную, но **ролики не монтируются**, а автопилот не запускается. Runner v8 заменяет `runner.mjs` v7 и продолжает выполнять его работу (очередь HeyGen/Shotstack).

На сервере с Docker Engine и Compose plugin, исходящий HTTPS (студия, Pixabay, Microsoft Edge TTS), входящие порты не нужны:

```bash
cd deploy/production-runner
umask 077
cat > .env <<EOF
STUDIO_URL=https://<домен-студии>
PRODUCTION_RUNNER_TOKEN=<тот же секрет, что в Sites>
PIXABAY_API_KEY=<ключ pixabay.com/api/docs>
EOF
chmod 600 .env
docker compose up -d --build
docker compose logs --tail=30 production-runner
```

`PRODUCTION_RUNNER_TOKEN` создаётся `openssl rand -hex 32`, сохраняется как secret в Sites, после чего версия сайта разворачивается заново.

Проверка: в «Новостном радаре» статус «Runner активен» (heartbeat не старше 3 минут). «Сделать выпуск» → через 1–2 минуты ролики со статусом «Ждёт проверки».

Контейнер: `read_only`, `cap_drop: ALL`, `no-new-privileges`, пользователь `nobody`, временные файлы в `tmpfs /tmp` (1 GB).

## 4. Локальный запуск (демо и разработка)

```bash
# студия
cp .dev.vars.example .dev.vars        # или создайте вручную, см. ниже
pnpm dev                              # http://127.0.0.1:5173
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local \
  --config wrangler.local.jsonc --persist-to .wrangler/state
# вход: http://127.0.0.1:5173/signin-with-chatgpt?return_to=/?view=radar

# runner (Python 3.13 + ffmpeg)
cd deploy/production-runner
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
STUDIO_URL=http://127.0.0.1:5173 PRODUCTION_RUNNER_TOKEN=<из .dev.vars> PIXABAY_API_KEY=<ключ> .venv/bin/python runner.py
```

`.dev.vars` (не коммитится):
```
PROVIDER_ENCRYPTION_KEY=<openssl rand -base64 32>
PRODUCTION_RUNNER_TOKEN=<openssl rand -hex 32>
SITE_PUBLIC_URL=http://localhost:5173
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
```

Локальный вход — тестовая личность Sites (`seedy@sites.test`), только для разработки. Не используйте её как production-авторизацию.
