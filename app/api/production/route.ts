import {z} from "zod";
import {identity,db,json,errorResponse,AppError,now} from "@/lib/server";
import {projectSchema} from "@/lib/news";
import {enqueue,ownRun,advanceRun} from "@/lib/production-queue";
export async function GET(req:Request){try{
 const u=await identity(),id=z.string().uuid().parse(new URL(req.url).searchParams.get("projectId"));
 const [runs,health,media]=await Promise.all([db().prepare("SELECT id,status,signature,result,error,created_at,updated_at FROM production_runs WHERE owner_id=? AND project_id=? ORDER BY created_at DESC LIMIT 12").bind(u.userId,id).all(),db().prepare("SELECT updated_at FROM worker_health WHERE id='runner'").first<{updated_at:string}>(),db().prepare("SELECT id,kind,mime,filename,bytes FROM media WHERE owner_id=? ORDER BY created_at DESC LIMIT 200").bind(u.userId).all()]);
 return json({runs:runs.results,media:media.results,runnerActive:!!health&&Date.now()-Date.parse(health.updated_at)<180000,runnerLastSeen:health?.updated_at||null});
}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
 const u=await identity(req),raw:any=await req.json();
 if(raw.action==="start"){z.literal(true).parse(raw.consent);const p=projectSchema.parse(raw.project);if(!await db().prepare("SELECT id FROM projects WHERE id=? AND owner_id=?").bind(p.id,u.userId).first())throw new AppError("Сохраните выпуск.");return json({run:await enqueue(u.userId,p,z.string().uuid().parse(raw.requestKey))});}
 const id=z.string().uuid().parse(raw.id);await ownRun(id,u.userId);
 if(raw.action==="advance")return json({run:await advanceRun(id,u.userId)});
 if(raw.action==="pause"){await db().prepare("UPDATE production_runs SET status='paused',updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','running','waiting')").bind(now(),id,u.userId).run();return json({run:await ownRun(id,u.userId)});}
 throw new AppError("Неизвестная операция.");
}catch(e){return errorResponse(e)}}
