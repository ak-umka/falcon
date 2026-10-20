import { AppError,db,now,uid,ownMedia } from "./server";
import { projectSchema,type Project } from "./news";
import { sceneSignature,videoSignature } from "./production";
import { jobList,checkJob,startScene,startAssembly } from "./media-jobs";
import { withProductionOwner } from "./provider-context";
import { mediaKey } from "./ai-server";
export type ProductionRun={id:string;owner_id:string;project_id:string;request_key:string;status:string;document:string;signature:string;result:string|null;error:string|null;updated_at:string;created_at:string};
export async function ownRun(id:string,owner:string){const run=await db().prepare("SELECT * FROM production_runs WHERE id=? AND owner_id=?").bind(id,owner).first<ProductionRun>();if(!run)throw new AppError("Задание не найдено.",404);return run;}
async function keyFor(value:string){const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))).slice(0,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const hex=Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
export async function enqueue(owner:string,p:Project,requestKey:string){
 const prior=await db().prepare("SELECT id FROM production_runs WHERE owner_id=? AND request_key=?").bind(owner,requestKey).first<{id:string}>();if(prior)return ownRun(prior.id,owner);
 if(!p.scenes.length||p.script.trim()!==p.scenes.map(s=>s.text).join("\n\n").trim())throw new AppError("Проверьте сценарий и сцены.");
 await mediaKey(owner,"shotstack");
 if(p.scenes.some(s=>s.kind==="presenter")){await mediaKey(owner,"heygen");if(!p.avatarId||!p.scenes.filter(s=>s.kind==="presenter").every(s=>s.text.trim()))throw new AppError("Выберите ведущего и заполните текст его сцен.");if(p.narration==="elevenlabs"){await mediaKey(owner,"elevenlabs");if(!p.narrationVoice||!p.narrationModel)throw new AppError("Выберите голос и модель ElevenLabs.");}else if(!p.voiceId)throw new AppError("Выберите голос HeyGen.");}
 for(const s of p.scenes.filter(s=>s.kind!=="presenter")){if(!s.mediaId)throw new AppError("Выберите файл каждой вставки.");const m=await ownMedia(s.mediaId,owner);if(s.kind==="video"?m.kind!=="video":!m.mime.startsWith("image/"))throw new AppError("Неверный тип файла вставки.");if(s.audioId){const a=await ownMedia(s.audioId,owner);if(a.kind!=="audio")throw new AppError("Неверный файл озвучки.");}}
 const id=uid(),stamp=now();
 try{await db().prepare("INSERT INTO production_runs(id,owner_id,project_id,request_key,status,document,signature,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,owner,p.id,requestKey,"queued",JSON.stringify(p),videoSignature(p),stamp,stamp).run();}
 catch{const existing=await db().prepare("SELECT id FROM production_runs WHERE owner_id=? AND (request_key=? OR (project_id=? AND status IN ('queued','running','waiting'))) ORDER BY created_at DESC LIMIT 1").bind(owner,requestKey,p.id).first<{id:string}>();if(existing)return ownRun(existing.id,owner);throw new AppError("Не удалось сохранить задание.",409);}
 return ownRun(id,owner);
}
export async function advanceRun(id:string,owner:string){
 const token=uid(),claimed=await db().prepare("UPDATE production_runs SET lease_token=?,lease_until=?,status='running',updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','running','waiting') AND lease_until<?").bind(token,Date.now()+300000,now(),id,owner,Date.now()).run();
 if(!claimed.meta.changes)return ownRun(id,owner);
 const finish=async(status:string,result:unknown=null,error:string|null=null)=>{await db().prepare("UPDATE production_runs SET status=?,result=?,error=?,lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND owner_id=? AND lease_token=? AND status='running'").bind(status,result?JSON.stringify(result):null,error,now(),id,owner,token).run();};
 try{await withProductionOwner(owner,async()=>{
   const run=await ownRun(id,owner),p=projectSchema.parse(JSON.parse(run.document)),jobs=await jobList(owner,p.id);
   for(const s of p.scenes.filter(s=>s.kind==="presenter")){
     let j=jobs.find(j=>j.scene_id===s.id&&j.signature===sceneSignature(p,s)&&j.status!=="abandoned");
     if(!j)j=await startScene(owner,p,s,await keyFor(`${id}:${s.id}`));
     else if(["preparing","processing"].includes(j.status))j=await checkJob(owner,j);
     if(["failed","unconfirmed","abandoned"].includes(j.status)){await finish("blocked",null,j.error||"Проверьте задачу у провайдера.");return;}
     if(j.status!=="completed"){await finish("waiting");return;}
   }
   let assembly=jobs.find(j=>j.operation==="assembly"&&j.signature===run.signature&&j.status!=="abandoned");
   if(!assembly)assembly=await startAssembly(owner,p,await keyFor(`${id}:assembly`));
   else if(assembly.status==="processing")assembly=await checkJob(owner,assembly);
   if(assembly.status==="completed"){await finish("completed",{...JSON.parse(assembly.result||"{}"),signature:run.signature});return;}
   if(["failed","unconfirmed","abandoned"].includes(assembly.status)){await finish("blocked",null,assembly.error||"Проверьте сборку у провайдера.");return;}
   await finish("waiting");
 });}catch(e){await finish("blocked",null,e instanceof AppError?e.message:"Этап не завершён. Проверьте историю задач перед повтором.");}
 return ownRun(id,owner);
}
export async function tickQueue(){
 const rows=await db().prepare("SELECT id,owner_id FROM production_runs WHERE status IN ('queued','running','waiting') AND lease_until<? ORDER BY updated_at LIMIT 1").bind(Date.now()).all<{id:string;owner_id:string}>();
 for(const row of rows.results)await advanceRun(row.id,row.owner_id);
 await db().prepare("INSERT INTO worker_health(id,updated_at) VALUES('runner',?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at").bind(now()).run();
 return {processed:rows.results.length};
}
