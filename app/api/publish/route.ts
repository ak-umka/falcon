import { projectSchema } from "@/lib/news";
import { videoSignature,sameRenderedVersion } from "@/lib/production";
import { publishSchema, publicationPayload, checkPublication } from "@/lib/news";
import { identity, db, bucket, ownMedia, now, uid, json, errorResponse, AppError, social } from "@/lib/server";
import type { Json } from "@/lib/connectors";
export async function POST(req:Request){let id:string|undefined;try{
  const u=await identity(req);const b=publishSchema.parse(await req.json());
  const previous=await db().prepare("SELECT * FROM publications WHERE owner_id=? AND request_key=?").bind(u.userId,b.requestKey).first();if(previous)return json({publication:previous,replayed:false});
  const project=await db().prepare("SELECT id,document FROM projects WHERE id=? AND owner_id=?").bind(b.projectId,u.userId).first<any>();if(!project)throw new AppError("Сначала сохраните выпуск.");
  const saved=projectSchema.parse(JSON.parse(project.document));if(b.mediaId&&(saved.mediaId!==b.mediaId||saved.mediaSignature&&saved.mediaSignature!==videoSignature(saved)))throw new AppError("Видео не соответствует текущей версии выпуска. Соберите или загрузите актуальный MP4.",409);
  let mediaId=b.mediaId;
  if(b.jobId){const j=await db().prepare("SELECT * FROM jobs WHERE id=? AND owner_id=? AND status='completed'").bind(b.jobId,u.userId).first<any>();if(!j||j.project_id!==b.projectId)throw new AppError("Готовый ролик не найден.");if(!sameRenderedVersion(saved,projectSchema.parse(JSON.parse(j.document))))throw new AppError("Этот ролик создан для предыдущей версии выпуска. Создайте актуальное видео.",409);mediaId=JSON.parse(j.result).mediaId;}
  const m=await ownMedia(mediaId!,u.userId);if(m.kind!=="video"||m.mime!=="video/mp4")throw new AppError("Для публикации нужен готовый MP4.");
  const ratio=Math.abs(b.width/b.height-9/16)<0.03?"9:16":"other";
  const validation=checkPublication({selected:b.channels.map(c=>c.platform),caption:b.caption,bytes:m.bytes,ratio});if(validation.length)throw new AppError(validation.join(" "));
  const live=await social("list_channels",{active:true});const channels=live.data.channels||[];
  if(live.data.capabilities?.canCreatePosts!==true||live.data.capabilities?.canPublishPosts!==true)throw new AppError("У текущего подключения нет прав на публикацию. Проверьте роль в BulkPublish.",403);
  for(const target of b.channels){const c=channels.find((x:any)=>Number(x.channelId??x.id)===target.channelId&&x.platform===target.platform);
    if(!c||c.isActive===false||c.active===false||c.needsReconnect||c.platformAvailable===false||["expired","invalid","revoked"].includes(c.tokenStatus))throw new AppError("Один из выбранных каналов недоступен. Обновите подключения.");}
  id=uid();await db().prepare("INSERT INTO publications(id,owner_id,project_id,request_key,status,payload,created_at) VALUES(?,?,?,?,?,?,?)").bind(id,u.userId,b.projectId,b.requestKey,"uploading",JSON.stringify(b),now()).run();
  const upload=await social("create_media_upload",{contentType:"video/mp4",sizeBytes:m.bytes});const uploadUrl=upload.data.uploadUrl, r2Key=upload.data.r2Key;
  if(typeof uploadUrl!=="string"||!uploadUrl.startsWith("https://")||typeof r2Key!=="string")throw new AppError("Не удалось подготовить загрузку видео.",502,"unconfirmed");
  const file=await bucket().get(m.key);if(!file)throw new AppError("Исходное видео не найдено.",404);
  const put=await fetch(uploadUrl,{method:"PUT",headers:{"Content-Type":"video/mp4","Content-Length":String(m.bytes)},body:file.body,signal:AbortSignal.timeout(90000)});
  if(!put.ok)throw new AppError("BulkPublish не принял видео.",502);
  const uploaded=await social("finalize_media_upload",{r2Key,fileName:m.filename,mimeType:"video/mp4",sizeBytes:m.bytes,duration:b.duration,width:b.width,height:b.height});
  const mediaFileId=Number(uploaded.data.file?.id);if(!Number.isSafeInteger(mediaFileId)||mediaFileId<1)throw new AppError("Видео загружено, но его ID не подтверждён.",502,"unconfirmed");
  await db().prepare("UPDATE publications SET media_file_id=?,status='creating' WHERE id=?").bind(mediaFileId,id).run();
  const created=await social("create_post",publicationPayload(b,mediaFileId) as unknown as Record<string,Json>);const postId=Number(created.data.id);
  if(!Number.isSafeInteger(postId)||postId<1)throw new AppError("Статус создания публикации неизвестен. Проверьте BulkPublish перед повтором.",502,"unconfirmed");
  await db().prepare("UPDATE publications SET external_id=?,status=?,result=? WHERE id=?").bind(postId,created.data.status||"draft",JSON.stringify(created.envelope),id).run();
  let result=created;
  if(b.mode==="now"&&created.data.approvalStatus!=="pending"){
    await db().prepare("UPDATE publications SET status='publishing' WHERE id=?").bind(id).run();result=await social("publish_post",{postId});
  }
  const status=result.data.approvalStatus==="pending"?"awaiting_approval":result.data.status||"unconfirmed";
  await db().prepare("UPDATE publications SET status=?,result=? WHERE id=?").bind(status,JSON.stringify(result.envelope),id).run();
  const publication=await db().prepare("SELECT * FROM publications WHERE id=?").bind(id).first();return json({publication,provider:result.envelope});
}catch(e){if(id)await db().prepare("UPDATE publications SET status='needs_attention',error=? WHERE id=?").bind(e instanceof Error?e.message:"Результат не подтверждён.",id).run();return errorResponse(e)}}
