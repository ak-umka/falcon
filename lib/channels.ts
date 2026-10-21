// Прямая публикация без участия человека: Telegram-канал (Bot API) и YouTube Shorts (Data API v3).
// BulkPublish остаётся для площадок, где нужна авторизация посетителя студии.
import { env } from "cloudflare:workers";
import { AppError, bucket, db, decryptCredential, encryptCredential, now, ownMedia, uid } from "./server";
import { signingSecret } from "./render-grants";

export type ChannelId = "telegram" | "youtube";
type Secret = { telegram: { token: string; chatId: string }; youtube: { refreshToken: string } };
const vars = () => env as unknown as Record<string, string>;

export async function channelSecret<C extends ChannelId>(owner: string, channel: C): Promise<Secret[C] | null> {
  const row = await db().prepare("SELECT ciphertext FROM media_connections WHERE owner_id=? AND provider=?").bind(owner, channel).first<{ ciphertext: string }>();
  return row ? JSON.parse(await decryptCredential(row.ciphertext, `${owner}:media:${channel}`)) : null;
}
async function saveChannel(owner: string, channel: ChannelId, secret: unknown, metadata: Record<string, string>) {
  await db().prepare("INSERT INTO media_connections(id,owner_id,provider,ciphertext,metadata,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,metadata=excluded.metadata,updated_at=excluded.updated_at")
    .bind(uid(), owner, channel, await encryptCredential(JSON.stringify(secret), `${owner}:media:${channel}`), JSON.stringify(metadata), now()).run();
}
export async function disconnectChannel(owner: string, channel: ChannelId) {
  await db().prepare("DELETE FROM media_connections WHERE owner_id=? AND provider=?").bind(owner, channel).run();
}
export async function channelStatus(owner: string) {
  const rows = await db().prepare("SELECT provider,metadata FROM media_connections WHERE owner_id=? AND provider IN ('telegram','youtube')").bind(owner).all<{ provider: ChannelId; metadata: string }>();
  const meta = (c: ChannelId) => { const r = rows.results.find(r => r.provider === c); return r ? JSON.parse(r.metadata) as Record<string, string> : null; };
  return { telegram: meta("telegram"), youtube: meta("youtube"), youtubeAvailable: Boolean(vars().YOUTUBE_CLIENT_ID && vars().YOUTUBE_CLIENT_SECRET) };
}

// ---------- Telegram ----------
async function telegram(token: string, method: string, body: FormData | Record<string, unknown>) {
  let r: Response;
  try { r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(method === "sendVideo" ? 120000 : 20000) }); }
  catch { throw new AppError("Telegram: ответ не получен. Проверьте канал перед повторной отправкой.", 502, "unconfirmed"); }
  const d: any = await r.json().catch(() => ({}));
  if (!d.ok) throw new AppError(`Telegram: ${d.description || `HTTP ${r.status}`}`, r.status === 401 || r.status === 404 ? 400 : 502, "provider_error");
  return d.result;
}
export async function connectTelegram(owner: string, token: string, chat: string) {
  if (!/^\d{6,12}:[\w-]{30,}$/.test(token)) throw new AppError("Похоже, это не токен бота. Получите его у @BotFather.");
  const chatId = /^-?\d+$/.test(chat) ? chat : `@${chat.replace(/^https:\/\/t\.me\//, "").replace(/^@/, "")}`;
  const me = await telegram(token, "getMe", {}), info = await telegram(token, "getChat", { chat_id: chatId });
  // Канал — бот должен быть админом с правом публикации; группа — участником; личный чат — пользователь нажал /start.
  if (info.type !== "private") {
    const member = await telegram(token, "getChatMember", { chat_id: info.id, user_id: me.id });
    if (info.type === "channel" ? member.status !== "administrator" || member.can_post_messages === false : ["left", "kicked"].includes(member.status))
      throw new AppError(info.type === "channel" ? `Сделайте @${me.username} администратором канала с правом публикации.` : `Добавьте @${me.username} в группу.`);
  }
  const name = info.title || (info.type === "private" ? `Личный чат ${[info.first_name, info.last_name].filter(Boolean).join(" ")}`.trim() : chatId);
  await saveChannel(owner, "telegram", { token, chatId: String(info.id) }, { name, bot: `@${me.username}` });
  return { name };
}
async function publishTelegram(owner: string, mediaId: string, caption: string) {
  const secret = await channelSecret(owner, "telegram"); if (!secret) throw new AppError("Telegram-канал не подключён.");
  const m = await ownMedia(mediaId, owner), file = await bucket().get(m.key); if (!file) throw new AppError("Файл ролика не найден.", 404);
  if (m.bytes > 50 * 1024 * 1024) throw new AppError("Telegram Bot API принимает видео до 50 MB.");
  const form = new FormData();
  form.append("chat_id", secret.chatId); form.append("caption", caption.slice(0, 1024)); form.append("supports_streaming", "true");
  form.append("width", "1080"); form.append("height", "1920"); form.append("video", new Blob([await file.arrayBuffer()], { type: m.mime }), m.filename);
  const msg = await telegram(secret.token, "sendVideo", form);
  // Публичная ссылка есть только у сообщений в публичных каналах и группах.
  return msg.chat?.type !== "private" && msg.chat?.username ? `https://t.me/${msg.chat.username}/${msg.message_id}` : `Сообщение №${msg.message_id} в чате`;
}

// ---------- YouTube ----------
const encoder = new TextEncoder();
async function stateKey() {
  return crypto.subtle.importKey("raw", encoder.encode(`youtube-oauth-v1:${signingSecret()}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
function youtubeClient() {
  const id = vars().YOUTUBE_CLIENT_ID, secret = vars().YOUTUBE_CLIENT_SECRET;
  if (!id || !secret) throw new AppError("YouTube не настроен: задайте YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET в секретах сайта.", 503);
  return { id, secret };
}
export async function youtubeConnectURL(owner: string, origin: string) {
  const { id } = youtubeClient(), expires = Math.floor(Date.now() / 1000) + 600, payload = `${owner}|${expires}`;
  const state = `${expires}.${hex(await crypto.subtle.sign("HMAC", await stateKey(), encoder.encode(payload)))}`;
  const q = new URLSearchParams({ client_id: id, redirect_uri: `${origin}/api/youtube/callback`, response_type: "code", access_type: "offline", prompt: "consent",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
async function googleToken(params: Record<string, string>) {
  const { id, secret } = youtubeClient();
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }), signal: AbortSignal.timeout(20000) });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new AppError(`Google: ${d.error_description || d.error || `HTTP ${r.status}`}`, 502, "provider_error");
  return d as { access_token: string; refresh_token?: string };
}
export async function completeYoutube(owner: string, origin: string, code: string, state: string) {
  const [expires, signature] = state.split(".");
  if (!/^\d{10}$/.test(expires || "") || Number(expires) < Date.now() / 1000 || !/^[0-9a-f]{64}$/.test(signature || "") ||
    !await crypto.subtle.verify("HMAC", await stateKey(), Uint8Array.from(signature.match(/../g)!, v => parseInt(v, 16)), encoder.encode(`${owner}|${expires}`)))
    throw new AppError("Ссылка подключения устарела. Начните подключение YouTube заново.", 400);
  const t = await googleToken({ code, grant_type: "authorization_code", redirect_uri: `${origin}/api/youtube/callback` });
  if (!t.refresh_token) throw new AppError("Google не выдал долгосрочный доступ. Отзовите доступ приложения в аккаунте Google и подключите снова.");
  const ch: any = await (await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
  const name = ch.items?.[0]?.snippet?.title; if (!name) throw new AppError("У выбранного аккаунта нет YouTube-канала. Выберите канал при входе.");
  await saveChannel(owner, "youtube", { refreshToken: t.refresh_token }, { name });
  return name as string;
}
async function publishYoutube(owner: string, mediaId: string, title: string, description: string, language: string) {
  const secret = await channelSecret(owner, "youtube"); if (!secret) throw new AppError("YouTube не подключён.");
  const { access_token } = await googleToken({ refresh_token: secret.refreshToken, grant_type: "refresh_token" });
  const m = await ownMedia(mediaId, owner), file = await bucket().get(m.key); if (!file) throw new AppError("Файл ролика не найден.", 404);
  const fullTitle = (title.length <= 90 && !/#shorts/i.test(title) ? `${title} #Shorts` : title).slice(0, 100);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST", headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json", "X-Upload-Content-Type": m.mime, "X-Upload-Content-Length": String(m.bytes) },
    body: JSON.stringify({ snippet: { title: fullTitle, description: description.slice(0, 4900), categoryId: "25", defaultLanguage: language, defaultAudioLanguage: language },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false, containsSyntheticMedia: true } }),
  });
  const location = init.headers.get("location");
  if (!init.ok || !location) throw new AppError(`YouTube: не удалось начать загрузку (HTTP ${init.status}). Проверьте квоту и доступ.`, 502, "provider_error");
  let put: Response;
  try { put = await fetch(location, { method: "PUT", headers: { "Content-Type": m.mime }, body: await file.arrayBuffer(), signal: AbortSignal.timeout(300000) }); }
  catch { throw new AppError("YouTube: загрузка не подтверждена. Проверьте YouTube Studio перед повтором.", 502, "unconfirmed"); }
  const d: any = await put.json().catch(() => ({}));
  if (!put.ok || !d.id) throw new AppError(`YouTube: HTTP ${put.status}. Проверьте YouTube Studio перед повтором.`, 502, "unconfirmed");
  return `https://youtube.com/shorts/${d.id}`;
}

export type PublishTarget = { channel: ChannelId; status: "published" | "failed"; url?: string; error?: string; at: string };
export async function publishVideo(owner: string, input: { mediaId: string; title: string; caption: string; language: string }, channels: ChannelId[]) {
  const results: PublishTarget[] = [];
  for (const channel of channels) {
    try {
      const url = channel === "telegram" ? await publishTelegram(owner, input.mediaId, input.caption) : await publishYoutube(owner, input.mediaId, input.title, input.caption, input.language);
      results.push({ channel, status: "published", url, at: now() });
    } catch (e) { results.push({ channel, status: "failed", error: e instanceof AppError ? e.message : "Не удалось опубликовать.", at: now() }); }
  }
  return results;
}
