import { z } from "zod";import { projectSchema, backgrounds } from "@/lib/news";
import { identity, db, now, uid, json, errorResponse, providerConfigured, AppError, uploadAsset, heygen } from "@/lib/server";
import { baseAvatar, projectBackground } from "@/lib/background-server";
export async function POST(req:Request){let jobId:string|undefined;try{
  const u=await identity(req);const b=z.object({project:projectSchema,requestKey:z.string().uuid(),consent:z.literal(true)}).parse(await req.json());const p=b.project;
  if(p.videoProvider!=="heygen")throw new AppError("Для Google Flow подготовьте материалы на вкладке видео.");
  if(p.background==="recipe")throw new AppError("Для HeyGen сначала создайте AI-сцену или загрузите готовый фон.");
  if(!await providerConfigured())throw new AppError("Подключите HeyGen API, чтобы оживить фотографию и создать видео.",503,"provider_not_configured");
  if(!p.avatarId)throw new AppError("Добавьте фото ведущего.");
  if(p.voiceMode==="tts"&&(!p.script.trim()||!p.voiceId))throw new AppError("Добавьте текст и выберите голос.");
  if(p.voiceMode==="audio"&&!p.audioId)throw new AppError("Загрузите запись голоса.");
  const avatar=await db().prepare("SELECT * FROM avatars WHERE id=? AND owner_id=?").bind(p.avatarId,u.userId).first<any>();if(!avatar)throw new AppError("Ведущий не найден.",404);
  const scene=await projectBackground(p,u.userId);
  const existing=await db().prepare("SELECT * FROM jobs WHERE owner_id=? AND request_key=?").bind(u.userId,b.requestKey).first();if(existing)return json({job:existing,replayed:false});
  const active=await db().prepare("SELECT id FROM jobs WHERE owner_id=? AND project_id=? AND status IN ('submitting','pending','processing','unconfirmed') LIMIT 1").bind(u.userId,p.id).first();if(active)throw new AppError("У этого выпуска уже есть запрос генерации. Проверьте его статус.",409);
  jobId=uid();await db().prepare("INSERT INTO jobs(id,owner_id,project_id,request_key,status,document,created_at) VALUES(?,?,?,?,?,?,?)").bind(jobId,u.userId,p.id,b.requestKey,"submitting",JSON.stringify(p),now()).run();
  const avatarId=scene?.kind==="generated"?scene.provider_id:await baseAvatar(avatar,u.userId);
  const backgroundConfig=scene?.kind==="uploaded"?{remove_background:true,background:{asset_id:await uploadAsset(scene.photo_id,u.userId)}}:p.background!=="original"&&p.background!=="scene"?{remove_background:true,background:{value:backgrounds[p.background]}}:{};
  const speech=p.voiceMode==="audio"?{audio_asset_id:await uploadAsset(p.audioId!,u.userId)}:{script:p.script,voice_id:p.voiceId};
  const r=await heygen("/v3/videos",{type:"avatar",avatar_id:avatarId,...speech,title:p.title,resolution:"1080p",aspect_ratio:p.ratio,
    ...(p.captions?{caption:{style:"default"}}:{}),...backgroundConfig,
    motion_prompt:"Calm professional news presenter, restrained natural movements, direct eye contact",expressiveness:"low"});
  const videoId=r.data?.video_id;if(typeof videoId!=="string")throw new AppError("HeyGen не подтвердил запрос видео. Проверьте кабинет перед повтором.",502,"unconfirmed");
  await db().prepare("UPDATE jobs SET status='pending',provider_id=? WHERE id=? AND owner_id=?").bind(videoId,jobId,u.userId).run();
  return json({job:{id:jobId,project_id:p.id,status:"pending",provider_id:videoId,document:JSON.stringify(p)}});
}catch(e){if(jobId){const status=e instanceof AppError&&e.code==="provider_error"?"failed":"unconfirmed";await db().prepare("UPDATE jobs SET status=?,error=? WHERE id=?").bind(status,e instanceof Error?e.message:"Запрос не подтвержден.",jobId).run();}return errorResponse(e)}}
