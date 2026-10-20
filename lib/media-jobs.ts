import { renderURL } from "./render-grants";
import { openaiImageSize } from "./openai-contract";
import { AppError, db, now, uid, heygen, uploadAsset, ownMedia } from "./server";
import { mediaKey, providerFetch, boundedBytes, storeBytes, downloadMaterial, storeVideo } from "./ai-server";
import { baseAvatar, projectBackground } from "./background-server";
import { backgrounds, type Project } from "./news";
import { assemblyPayload, sceneSignature, videoSignature, type ProductionScene,type AssemblyClip } from "./production";
import type { AIJob, AssetRequest, ProviderId } from "./ai-catalog";

export async function ownedJob(id:string,owner:string){const r=await db().prepare("SELECT * FROM media_jobs WHERE id=? AND owner_id=?").bind(id,owner).first<AIJob>();if(!r)throw new AppError("Задача не найдена.",404);return r;}
export async function jobList(owner:string,projectId:string){
  await db().prepare("UPDATE media_jobs SET status='unconfirmed',error='Ответ не подтверждён. Проверьте кабинет провайдера перед повтором.' WHERE owner_id=? AND project_id=? AND status='submitting' AND created_at<?").bind(owner,projectId,new Date(Date.now()-5*60000).toISOString()).run();
  return (await db().prepare("SELECT * FROM media_jobs WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 200").bind(owner,projectId).all<AIJob>()).results;
}
async function complete(id:string,result:unknown){await db().prepare("UPDATE media_jobs SET status='completed',result=?,error=NULL WHERE id=?").bind(JSON.stringify(result),id).run();}
async function pending(id:string,externalId:string){await db().prepare("UPDATE media_jobs SET status='processing',external_id=?,error=NULL WHERE id=?").bind(externalId,id).run();}
async function reserve(owner:string,p:Project,requestKey:string,provider:ProviderId,operation:string,sceneId:string,signature:string,document:unknown){
  const duplicate=await db().prepare("SELECT * FROM media_jobs WHERE owner_id=? AND request_key=?").bind(owner,requestKey).first<AIJob>();if(duplicate)return {job:duplicate,created:false};
  const id=uid();
  try{await db().prepare("INSERT INTO media_jobs(id,owner_id,project_id,scene_id,request_key,provider,operation,status,signature,document,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,owner,p.id,sceneId,requestKey,provider,operation,"submitting",signature,JSON.stringify(document),now()).run();}
  catch{const existing=await db().prepare("SELECT * FROM media_jobs WHERE owner_id=? AND request_key=?").bind(owner,requestKey).first<AIJob>();if(existing)return {job:existing,created:false};throw new AppError("Для этого материала уже есть активная или неподтверждённая задача. Обновите статус.",409);}
  return {job:await ownedJob(id,owner),created:true};
}
async function failJob(id:string,e:unknown){
  const definite=e instanceof AppError&&["provider_error","invalid_request","provider_not_configured"].includes(e.code);
  await db().prepare("UPDATE media_jobs SET status=?,error=? WHERE id=?").bind(definite?"failed":"unconfirmed",e instanceof AppError?e.message:"Ответ не подтверждён. Проверьте кабинет сервиса перед повторной генерацией.",id).run();
}
export async function elevenAudio(owner:string,id:string,text:string,voiceId:string,model:string){
  if(!/^[a-zA-Z0-9_-]{1,150}$/.test(voiceId)||!model)throw new AppError("Выберите голос и модель ElevenLabs.");
  const key=await mediaKey(owner,"elevenlabs");
  const response=await providerFetch("elevenlabs",`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,key,{text,model_id:model});
  const bytes=await boundedBytes(response);if(!(String.fromCharCode(...bytes.slice(0,3))==="ID3"||bytes[0]===255&&(bytes[1]&224)===224))throw new AppError("ElevenLabs вернул неподдерживаемое аудио.",502,"invalid_output");
  return storeBytes(id,owner,bytes,"audio/mpeg","audio");
}
export async function startAsset(owner:string,p:Project,key:string,input:AssetRequest){
  const providerKey=await mediaKey(owner,input.provider);
  const reserved=await reserve(owner,p,key,input.provider,input.operation,`asset:${input.operation}`,"",{input});if(!reserved.created)return reserved.job;
  const id=reserved.job.id;
  try{
    if(input.operation==="audio"){
      const mediaId=await elevenAudio(owner,id,input.prompt,input.voiceId!,input.model);await complete(id,{mediaId,kind:"audio"});
    }else if(input.operation==="image"&&input.provider==="openai"){
      const response=await providerFetch("openai","https://api.openai.com/v1/images/generations",providerKey,{model:input.model,prompt:input.prompt,n:1,size:openaiImageSize(input.ratio),output_format:"png"});
      const data:any=JSON.parse(new TextDecoder().decode(await boundedBytes(response,12*1024*1024)));
      const encoded=data?.data?.[0]?.b64_json;
      if(typeof encoded!=="string"||!encoded.length||encoded.length>11*1024*1024)throw new AppError("OpenAI не вернул изображение допустимого размера.",502,"invalid_output");
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
      if(bytes.length>8*1024*1024||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw new AppError("OpenAI вернул неподдерживаемый PNG или файл больше 8 MB.",502,"invalid_output");
      const mediaId=await storeBytes(id,owner,bytes,"image/png","background");await complete(id,{mediaId,kind:"image",size:openaiImageSize(input.ratio)});
    }else if(input.operation==="image"){
      const data:any=await (await providerFetch("google",`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,providerKey,{contents:[{parts:[{text:input.prompt}]}],generationConfig:{responseModalities:["TEXT","IMAGE"],imageConfig:{aspectRatio:input.ratio}}})).json();
      const inline=data.candidates?.[0]?.content?.parts?.map((x:any)=>x.inlineData||x.inline_data).find((x:any)=>x?.data);
      if(!inline||!["image/png","image/jpeg","image/webp"].includes(inline.mimeType||inline.mime_type)||inline.data.length>28*1024*1024)throw new AppError("Google не вернул подходящее изображение. Запрос мог быть оплачен.",502,"invalid_output");
      const bytes=Uint8Array.from(atob(inline.data),c=>c.charCodeAt(0)),mediaId=await storeBytes(id,owner,bytes,inline.mimeType||inline.mime_type,"background");await complete(id,{mediaId,kind:"image"});
    }else{
      const data:any=await (await providerFetch("google",`https://generativelanguage.googleapis.com/v1beta/models/${input.model}:predictLongRunning`,providerKey,{instances:[{prompt:input.prompt}],parameters:{aspectRatio:input.ratio,durationSeconds:8}})).json();
      if(typeof data.name!=="string"||!/^models\/[a-zA-Z0-9._-]+\/operations\/[a-zA-Z0-9_-]+$/.test(data.name))throw new AppError("Veo не подтвердил ID операции.",502,"unconfirmed");
      await pending(id,data.name);
    }
  }catch(e){await failJob(id,e);}
  return ownedJob(id,owner);
}
export async function startScene(owner:string,p:Project,scene:ProductionScene,key:string){
  if(scene.kind!=="presenter")throw new AppError("Вставка использует выбранный файл и не требует рендера ведущего.");
  if(!p.avatarId||!scene.text.trim())throw new AppError("Выберите ведущего и добавьте текст сцены.");
  if(p.narration==="heygen"&&!p.voiceId)throw new AppError("Выберите голос HeyGen в студии.");
  if(p.narration==="elevenlabs"&&(!p.narrationVoice||!p.narrationModel))throw new AppError("Выберите голос и модель ElevenLabs.");
  await mediaKey(owner,"heygen");if(p.narration==="elevenlabs")await mediaKey(owner,"elevenlabs");
  const input={...p,script:scene.text,background:scene.backgroundId?"scene" as const:p.background,backgroundId:scene.backgroundId||p.backgroundId};
  if(input.background==="recipe")throw new AppError("Сначала создайте или загрузите изображение фона.");
  const background=await projectBackground(input,owner);
  const avatar=await db().prepare("SELECT * FROM avatars WHERE id=? AND owner_id=?").bind(p.avatarId,owner).first<any>();if(!avatar)throw new AppError("Ведущий не найден.",404);
  const r=await reserve(owner,p,key,"heygen","presenter",scene.id,sceneSignature(p,scene),{project:p,scene});if(!r.created)return r.job;
  try{
    const avatarId=background?.kind==="generated"?background.provider_id:await baseAvatar(avatar,owner);
    const look=(await heygen(`/v3/avatars/looks/${encodeURIComponent(avatarId)}`)).data;
    if(look?.status==="failed")throw new AppError("HeyGen не смог подготовить фото ведущего.",502,"provider_error");
    if(look?.status!=="completed")await db().prepare("UPDATE media_jobs SET status='preparing',external_id=? WHERE id=?").bind(avatarId,r.job.id).run();
    else await renderScene(owner,r.job.id,p,scene,avatarId);
  }catch(e){await failJob(r.job.id,e);}
  return ownedJob(r.job.id,owner);
}
async function renderScene(owner:string,id:string,p:Project,scene:ProductionScene,avatarId:string){
  const input={...p,background:scene.backgroundId?"scene" as const:p.background,backgroundId:scene.backgroundId||p.backgroundId};
  const background=await projectBackground(input,owner);
  const speech=p.narration==="elevenlabs"?{audio_asset_id:await uploadAsset(await elevenAudio(owner,uid(),scene.text,p.narrationVoice,p.narrationModel),owner)}:{script:scene.text,voice_id:p.voiceId};
  const backdrop=background?.kind==="uploaded"?{remove_background:true,background:{asset_id:await uploadAsset(background.photo_id,owner)}}:input.background!=="original"&&input.background!=="scene"?{remove_background:true,background:{value:backgrounds[input.background]}}:{};
  const result=await heygen("/v3/videos",{type:"avatar",avatar_id:avatarId,...speech,...backdrop,title:`${p.title} · сцена ${p.scenes.findIndex(s=>s.id===scene.id)+1}`,resolution:"1080p",aspect_ratio:p.ratio,motion_prompt:"Calm professional news presenter, restrained natural movements, direct eye contact",expressiveness:"low"});
  if(typeof result.data?.video_id!=="string")throw new AppError("HeyGen не подтвердил ID сцены.",502,"unconfirmed");await pending(id,result.data.video_id);
}
export async function checkJob(owner:string,job:AIJob){
  if(job.status==="preparing"&&job.external_id){
    const look=(await heygen(`/v3/avatars/looks/${encodeURIComponent(job.external_id)}`)).data;
    if(look?.status==="failed"){await failJob(job.id,new AppError("Не удалось подготовить фото ведущего.",502,"provider_error"));return ownedJob(job.id,owner);}
    if(look?.status!=="completed")return job;
    const claimed=await db().prepare("UPDATE media_jobs SET status='submitting',external_id=NULL,created_at=? WHERE id=? AND owner_id=? AND status='preparing'").bind(now(),job.id,owner).run();
    if(!claimed.meta.changes)return ownedJob(job.id,owner);
    try{const {project,scene}=JSON.parse(job.document);await renderScene(owner,job.id,project,scene,job.external_id);}catch(e){await failJob(job.id,e);}
    return ownedJob(job.id,owner);
  }
  if(!job.external_id||["completed","failed","abandoned"].includes(job.status))return job;
  const key=await mediaKey(owner,job.provider);let url:string|undefined,duration:number|undefined;
  if(job.provider==="heygen"){
    const data=(await heygen(`/v3/videos/${encodeURIComponent(job.external_id)}`)).data;
    if(data?.status==="failed"){await db().prepare("UPDATE media_jobs SET status='failed',error='HeyGen не смог создать сцену.' WHERE id=?").bind(job.id).run();return ownedJob(job.id,owner);}
    if(data?.status!=="completed")return job;url=data.video_url;duration=Number(data.duration);
  }else if(job.provider==="google"){
    if(!/^models\/[a-zA-Z0-9._-]+\/operations\/[a-zA-Z0-9_-]+$/.test(job.external_id))throw new AppError("Некорректный ID операции.",502);
    const data:any=await (await providerFetch("google",`https://generativelanguage.googleapis.com/v1beta/${job.external_id}`,key)).json();
    if(data.error){await db().prepare("UPDATE media_jobs SET status='failed',error='Google не смог создать видео. Проверьте ограничения в кабинете.' WHERE id=?").bind(job.id).run();return ownedJob(job.id,owner);}
    if(!data.done)return job;url=data.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;duration=8;
  }else if(job.provider==="shotstack"){
    const data:any=await (await providerFetch("shotstack",`https://api.shotstack.io/edit/v1/render/${encodeURIComponent(job.external_id)}`,key)).json();
    if(data.response?.status==="failed"){await db().prepare("UPDATE media_jobs SET status='failed',error='Shotstack не смог собрать выпуск. Проверьте отчёт рендера в кабинете.' WHERE id=?").bind(job.id).run();return ownedJob(job.id,owner);}
    if(data.response?.status!=="done")return job;url=data.response.url;duration=Number(data.response.duration)||JSON.parse(job.document).duration;
  }
  if(typeof url!=="string")throw new AppError("Сервис не вернул готовый файл. Проверьте кабинет.",502);
  const file=await downloadMaterial(url,job.provider,key),mediaId=await storeVideo(job.id,owner,file);
  await complete(job.id,{mediaId,kind:"video",duration:typeof duration==="number"&&Number.isFinite(duration)&&duration>0?duration:null});return ownedJob(job.id,owner);
}
export async function startAssembly(owner:string,p:Project,key:string){
  if(!p.scenes.length)throw new AppError("В выпуске нет сцен.");
  if(p.script.trim()!==p.scenes.map(s=>s.text).join("\n\n").trim())throw new AppError("Текст сценария отличается от сцен. Обновите раскадровку.");
  const providerKey=await mediaKey(owner,"shotstack"),jobs=await jobList(owner,p.id),clips:AssemblyClip[]=[];
  for(const scene of p.scenes){
    if(scene.kind!=="presenter"){
      if(!scene.mediaId)throw new AppError("Выберите файл для каждой вставки.");
      const media=await ownMedia(scene.mediaId,owner);
      if(scene.kind==="video"?media.kind!=="video"||media.mime!=="video/mp4":!["image/png","image/jpeg","image/webp"].includes(media.mime))throw new AppError("Файл не соответствует типу сцены.");
      if(scene.audioId){const audio=await ownMedia(scene.audioId,owner);if(audio.kind!=="audio")throw new AppError("Выберите аудиофайл для озвучки.");}
      clips.push({kind:scene.kind,url:await renderURL(owner,scene.mediaId),duration:scene.duration,trim:scene.trim,mute:scene.mute,audioUrl:scene.audioId?await renderURL(owner,scene.audioId):undefined});continue;
    }
    const j=jobs.find(j=>j.scene_id===scene.id&&j.signature===sceneSignature(p,scene)&&j.status==="completed");
    if(!j?.external_id)throw new AppError("Сначала создайте актуальную версию каждой сцены.");
    // Refresh the provider's signed URL, never send a private Site URL to an external renderer.
    const data=(await heygen(`/v3/videos/${encodeURIComponent(j.external_id)}`)).data;
    if(data?.status!=="completed"||typeof data.video_url!=="string"||!(Number(data.duration)>0))throw new AppError("Провайдер не подтвердил готовность и длительность одной из сцен.",502);
    const url=new URL(data.video_url);if(url.protocol!=="https:"||url.username||url.password||!/(^|\.)(heygen\.ai|heygen\.com|amazonaws\.com|cloudfront\.net)$/.test(url.hostname))throw new AppError("Адрес сцены не подтверждён.",502);
    clips.push({url:data.video_url,duration:Number(data.duration)});
  }
  const duration=clips.reduce((sum,c)=>sum+c.duration,0);if(duration>1800)throw new AppError("Выпуск превышает 30 минут.");
  const r=await reserve(owner,p,key,"shotstack","assembly","assembly",videoSignature(p),{project:p,duration});if(!r.created)return r.job;
  try{const data:any=await (await providerFetch("shotstack","https://api.shotstack.io/edit/v1/render",providerKey,assemblyPayload(clips,p.ratio,p.captions))).json();if(typeof data.response?.id!=="string")throw new AppError("Shotstack не подтвердил ID сборки.",502,"unconfirmed");await pending(r.job.id,data.response.id);}catch(e){await failJob(r.job.id,e);}
  return ownedJob(r.job.id,owner);
}
