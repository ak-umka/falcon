import { AppError, bucket, db, heygen, now, uploadAsset } from "./server";
import { scenePrompt, sceneVideoMode } from "./backgrounds";
import type { BackgroundItem } from "./backgrounds";
import type { Project } from "./news";

export function backgroundView(row: any): BackgroundItem {
  const document = JSON.parse(row.document);
  return { id: row.id, name: row.name, kind: row.kind, status: row.status, avatarId: row.avatar_id,
    photoId: row.photo_id, ratio: document.ratio || null, recipe: document.recipe || null,
    error: row.error, createdAt: row.created_at };
}
export async function ownBackground(id: string, owner: string) {
  const row = await db().prepare("SELECT * FROM backgrounds WHERE id=? AND owner_id=?").bind(id, owner).first<any>();
  if (!row) throw new AppError("Фон не найден.", 404);
  return row;
}
export async function projectBackground(project: Project, owner: string) {
  if (project.background !== "scene") return null;
  if (!project.backgroundId) throw new AppError("Выберите готовый фон.");
  const row = await ownBackground(project.backgroundId, owner);
  const mode = sceneVideoMode(backgroundView(row), project.avatarId);
  if (mode === "unavailable") throw new AppError("Дождитесь готовности фона.");
  if (mode === "wrong_avatar") throw new AppError("Эта AI-сцена создана для другого ведущего. Выберите подходящую сцену.");
  if (mode === "avatar" && !row.provider_id) throw new AppError("Сцена не подтверждена у провайдера.");
  return row;
}
export async function baseAvatar(avatar: any, owner: string) {
  if (avatar.provider_id) return avatar.provider_id as string;
  const asset = await uploadAsset(avatar.photo_id, owner);
  const result = await heygen("/v3/avatars", { type: "photo", name: avatar.name, file: { type: "asset_id", asset_id: asset } }, "POST", `photo:${avatar.id}`);
  const id = result.data?.avatar_item?.id;
  if (typeof id !== "string") throw new AppError("HeyGen не подтвердил создание ведущего. Проверьте кабинет.", 502, "unconfirmed");
  await db().prepare("UPDATE avatars SET provider_id=? WHERE id=? AND owner_id=?").bind(id, avatar.id, owner).run();
  return id;
}
export async function prepareBackground(row: any, owner: string) {
  const avatar = await db().prepare("SELECT * FROM avatars WHERE id=? AND owner_id=?").bind(row.avatar_id, owner).first<any>();
  if (!avatar) throw new AppError("Ведущий не найден.", 404);
  const baseId = await baseAvatar(avatar, owner);
  const base = (await heygen(`/v3/avatars/looks/${encodeURIComponent(baseId)}`)).data;
  if (base?.status === "failed") throw new AppError("HeyGen не смог подготовить исходное фото.", 502, "provider_error");
  if (base?.status !== "completed") return row;
  const claimed = await db().prepare("UPDATE backgrounds SET status='submitting',updated_at=? WHERE id=? AND owner_id=? AND status='preparing'").bind(now(), row.id, owner).run();
  if (!claimed.meta.changes) return ownBackground(row.id, owner);
  const document = JSON.parse(row.document);
  const result = await heygen("/v3/avatars", { type: "prompt", name: row.name, avatar_id: baseId,
    prompt: scenePrompt(document.recipe), aspect_ratio: document.ratio }, "POST", `scene:${row.id}`);
  const id = result.data?.avatar_item?.id;
  if (typeof id !== "string") throw new AppError("Запрос сцены не подтверждён. Проверьте HeyGen перед новым запросом.", 502, "unconfirmed");
  await db().prepare("UPDATE backgrounds SET status='processing',provider_id=?,updated_at=? WHERE id=? AND owner_id=?").bind(id, now(), row.id, owner).run();
  return ownBackground(row.id, owner);
}
async function downloadImage(input: string) {
  let url = new URL(input);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || url.username || url.password || !/(^|\.)(heygen\.ai|heygen\.com|amazonaws\.com)$/.test(url.hostname)) throw new AppError("Адрес изображения не подтверждён. Откройте сцену в HeyGen.", 502);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); if (!location) break;
      await response.body?.cancel(); url = new URL(location, url); continue;
    }
    if (!response.ok || !response.body) throw new AppError("Изображение пока недоступно. Обновите статус.", 502);
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new AppError("Изображение превышает 20 MB.", 413); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!png && !jpg && !webp) throw new AppError("Провайдер вернул неподдерживаемое изображение.", 502);
    return { bytes, mime: png ? "image/png" : jpg ? "image/jpeg" : "image/webp", extension: png ? "png" : jpg ? "jpg" : "webp" };
  }
  throw new AppError("Не удалось получить изображение. Обновите статус.", 502);
}
export async function checkBackground(row: any, owner: string) {
  if (row.status === "preparing") return prepareBackground(row, owner);
  if (!row.provider_id || ["completed", "failed", "abandoned"].includes(row.status)) return row;
  const result = await heygen(`/v3/avatars/looks/${encodeURIComponent(row.provider_id)}`), look = result.data;
  if (look?.status === "failed") {
    await db().prepare("UPDATE backgrounds SET status='failed',error=?,updated_at=? WHERE id=? AND owner_id=?").bind(String(look.error?.message || "Не удалось создать сцену."), now(), row.id, owner).run();
  } else if (look?.status === "completed" && typeof look.preview_image_url === "string") {
    const file = await downloadImage(look.preview_image_url), key = `${owner}/${row.id}`;
    await bucket().put(key, file.bytes, { httpMetadata: { contentType: file.mime } });
    await db().prepare("INSERT OR IGNORE INTO media(id,owner_id,key,kind,mime,filename,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(row.id, owner, key, "scene", file.mime, `falcon-scene-${row.id.slice(0, 8)}.${file.extension}`, file.bytes.length, now()).run();
    await db().prepare("UPDATE backgrounds SET status='completed',photo_id=?,error=NULL,updated_at=? WHERE id=? AND owner_id=?").bind(row.id, now(), row.id, owner).run();
  }
  return ownBackground(row.id, owner);
}
