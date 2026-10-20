import { z } from "zod";
import { identity,db,json,errorResponse,AppError } from "@/lib/server";
import { projectSchema } from "@/lib/news";
import { assetRequestSchema } from "@/lib/ai-catalog";
import { ownedJob,jobList,startAsset,startScene,startAssembly,checkJob } from "@/lib/media-jobs";
export async function GET(req:Request){try{const u=await identity(),id=z.string().uuid().parse(new URL(req.url).searchParams.get("projectId"));return json({jobs:await jobList(u.userId,id)})}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
  const u=await identity(req),raw=z.record(z.unknown()).parse(await req.json());
  if(raw.action==="check"){const j=await ownedJob(z.string().uuid().parse(raw.id),u.userId);return json({job:await checkJob(u.userId,j)});}
  if(raw.action==="close"){
    const id=z.string().uuid().parse(raw.id);z.literal(true).parse(raw.checkedProvider);const j=await ownedJob(id,u.userId);
    if(j.status!=="unconfirmed")throw new AppError("Закрыть можно только неподтверждённую задачу.");
    await db().prepare("UPDATE media_jobs SET status='abandoned' WHERE id=? AND owner_id=? AND status='unconfirmed'").bind(id,u.userId).run();return json({job:await ownedJob(id,u.userId)});
  }
  z.literal(true).parse(raw.consent);const project=projectSchema.parse(raw.project),key=z.string().uuid().parse(raw.requestKey);
  if(!await db().prepare("SELECT id FROM projects WHERE id=? AND owner_id=?").bind(project.id,u.userId).first())throw new AppError("Сначала сохраните выпуск.");
  if(raw.action==="asset")return json({job:await startAsset(u.userId,project,key,assetRequestSchema.parse(raw.input))});
  if(raw.action==="scene"){const s=project.scenes.find(s=>s.id===raw.sceneId);if(!s)throw new AppError("Сцена не найдена.");return json({job:await startScene(u.userId,project,s,key)});}
  if(raw.action==="assemble")return json({job:await startAssembly(u.userId,project,key)});
  throw new AppError("Неизвестное действие.");
}catch(e){return errorResponse(e)}}
