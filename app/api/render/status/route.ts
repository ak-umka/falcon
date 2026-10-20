import { z } from "zod";import { identity, db, bucket, now, json, errorResponse, AppError, heygen } from "@/lib/server";
export async function POST(req:Request){try{
  const u=await identity(req);const {id}=z.object({id:z.string().uuid()}).parse(await req.json());
  const job=await db().prepare("SELECT * FROM jobs WHERE id=? AND owner_id=?").bind(id,u.userId).first<any>();if(!job)throw new AppError("Выпуск не найден.",404);
  if(!job.provider_id||["completed","failed"].includes(job.status))return json({job});
  const r=await heygen(`/v3/videos/${encodeURIComponent(job.provider_id)}`);const d=r.data||{};
  if(d.status==="failed"){await db().prepare("UPDATE jobs SET status='failed',error=? WHERE id=?").bind(String(d.failure_message||"Генерация не завершена."),id).run();return json({job:{...job,status:"failed",error:d.failure_message}});}
  if(d.status!=="completed"){const s=d.status==="processing"?"processing":"pending";await db().prepare("UPDATE jobs SET status=? WHERE id=?").bind(s,id).run();return json({job:{...job,status:s}});}
  if(typeof d.video_url!=="string")throw new AppError("Видео ещё не доступно для скачивания.",502);
  const url=new URL(d.video_url);if(url.protocol!=="https:"||!/(^|\.)(heygen\.ai|heygen\.com|amazonaws\.com)$/.test(url.hostname))throw new AppError("Неподдерживаемый адрес видео у провайдера. Откройте выпуск в HeyGen.",502);
  let file=await db().prepare("SELECT * FROM media WHERE id=? AND owner_id=?").bind(id,u.userId).first<any>();
  if(!file){
    const video=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!video.ok||!video.body)throw new AppError("Не удалось сохранить готовое видео. Повторите проверку статуса.",502);
    const key=`${u.userId}/${id}`,bytes=Number(video.headers.get("content-length"));
    if(!Number.isSafeInteger(bytes)||bytes<1||bytes>250*1024*1024)throw new AppError("Не удалось подтвердить размер MP4 (лимит 250 MB). Скачайте видео из HeyGen и загрузите его в студию.",502);
    const stream=new FixedLengthStream(bytes);
    await Promise.all([video.body.pipeTo(stream.writable),bucket().put(key,stream.readable,{httpMetadata:{contentType:"video/mp4"}})]);
    await db().prepare("INSERT OR IGNORE INTO media(id,owner_id,key,kind,mime,filename,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,u.userId,key,"video","video/mp4",`falcon-${id.slice(0,8)}.mp4`,bytes,now()).run();file={id,bytes};
  }
  const result={mediaId:id,videoUrl:`/api/media/${id}`,duration:d.duration,subtitleUrl:d.subtitle_url||null,bytes:file.bytes};
  await db().prepare("UPDATE jobs SET status='completed',result=?,error=NULL WHERE id=?").bind(JSON.stringify(result),id).run();return json({job:{...job,status:"completed",result:JSON.stringify(result)}});
}catch(e){return errorResponse(e)}}
