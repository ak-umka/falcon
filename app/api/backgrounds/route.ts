import { z } from "zod";
import { identity, db, now, uid, json, errorResponse, providerConfigured, AppError, ownMedia } from "@/lib/server";
import { sceneLocation, scenePrompt, sceneRecipeSchema } from "@/lib/backgrounds";
import { backgroundView, ownBackground, prepareBackground, checkBackground } from "@/lib/background-server";

export async function POST(req: Request) {
  let jobId: string | undefined, owner: string | undefined;
  try {
    const user = await identity(req); owner = user.userId;
    const input: any = await req.json();
    if (input.action === "upload") {
      const b = z.object({ mediaId: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(input);
      const media = await ownMedia(b.mediaId, owner);
      if (media.kind !== "background") throw new AppError("Загрузите изображение фона.");
      const previous = await db().prepare("SELECT * FROM backgrounds WHERE owner_id=? AND photo_id=? AND kind='uploaded'").bind(owner, b.mediaId).first();
      if (previous) return json({ background: backgroundView(previous) });
      const id = uid(), stamp = now();
      await db().prepare("INSERT INTO backgrounds(id,owner_id,request_key,name,kind,photo_id,status,document,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(id, owner, b.mediaId, b.name, "uploaded", b.mediaId, "completed", "{}", stamp, stamp).run();
      return json({ background: backgroundView(await ownBackground(id, owner)) });
    }
    if (input.action === "check") {
      const id = z.string().uuid().parse(input.id); const row = await ownBackground(id, owner);
      if (row.status === "preparing") jobId = id;
      return json({ background: backgroundView(await checkBackground(row, owner)) });
    }
    if (input.action === "release") {
      const b = z.object({ id: z.string().uuid(), checkedProvider: z.literal(true) }).parse(input);
      const row = await ownBackground(b.id, owner);
      if (!["unconfirmed", "submitting"].includes(row.status)) throw new AppError("Этот запрос не требует снятия блокировки.");
      if (Date.now() - new Date(row.updated_at).getTime() < 120000) throw new AppError("Дождитесь завершения текущего запроса и проверьте его статус.");
      await db().prepare("UPDATE backgrounds SET status='abandoned',error='Пользователь проверил кабинет провайдера и снял блокировку.',updated_at=? WHERE id=? AND owner_id=?").bind(now(), b.id, owner).run();
      return json({ background: backgroundView(await ownBackground(b.id, owner)) });
    }
    if (input.action !== "generate") throw new AppError("Неизвестное действие.");
    const b = z.object({ avatarId: z.string().uuid(), ratio: z.enum(["9:16", "16:9", "1:1"]), recipe: sceneRecipeSchema, requestKey: z.string().uuid(), consent: z.literal(true) }).parse(input);
    const previous = await db().prepare("SELECT * FROM backgrounds WHERE owner_id=? AND request_key=?").bind(owner, b.requestKey).first();
    if (previous) return json({ background: backgroundView(previous) });
    if (!await providerConfigured()) throw new AppError("Подключите HeyGen для генерации AI-сцен.", 503, "provider_not_configured");
    if (scenePrompt(b.recipe).length > 1000) throw new AppError("Сократите описание сцены.");
    const avatar = await db().prepare("SELECT * FROM avatars WHERE id=? AND owner_id=?").bind(b.avatarId, owner).first<any>();
    if (!avatar?.consent_at) throw new AppError("Добавьте своего ведущего и подтвердите право на использование фотографии.");
    const active = await db().prepare("SELECT id FROM backgrounds WHERE owner_id=? AND status IN ('preparing','submitting','processing','unconfirmed')").bind(owner).first();
    if (active) throw new AppError("Дождитесь текущей генерации или проверьте её статус.", 409);
    const id = uid(), stamp = now();
    await db().prepare("INSERT INTO backgrounds(id,owner_id,request_key,name,kind,avatar_id,status,document,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(id, owner, b.requestKey, sceneLocation(b.recipe).name, "generated", b.avatarId, "preparing", JSON.stringify({ recipe: b.recipe, ratio: b.ratio }), stamp, stamp).run();
    jobId = id;
    const row = await prepareBackground(await ownBackground(id, owner), owner);
    return json({ background: backgroundView(row) });
  } catch (error) {
    if (jobId && owner) {
      const status = error instanceof AppError && error.code === "provider_error" ? "failed" : "unconfirmed";
      await db().prepare("UPDATE backgrounds SET status=?,error=?,updated_at=? WHERE id=? AND owner_id=? AND status!='completed'").bind(status, error instanceof Error ? error.message : "Запрос не подтверждён.", now(), jobId, owner).run();
    }
    return errorResponse(error);
  }
}
