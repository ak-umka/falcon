import { identity, db, now, uid, json, errorResponse, providerConfigured, AppError, ownMedia } from "@/lib/server";
import { backgroundView, projectBackground } from "@/lib/background-server";
import { deepseekConfigured } from "@/lib/deepseek";
import { expireScriptJobs } from "@/lib/script-server";
import { projectSchema } from "@/lib/news";import { z } from "zod";
export const dynamic="force-dynamic";
export async function GET(){try{
  const u=await identity();await expireScriptJobs(u.userId);const r=await db().batch([
    db().prepare("SELECT * FROM projects WHERE owner_id=? AND archived=0 ORDER BY updated_at DESC LIMIT 100").bind(u.userId),
    db().prepare("SELECT * FROM avatars WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").bind(u.userId),
    db().prepare("SELECT * FROM jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").bind(u.userId),
    db().prepare("SELECT * FROM publications WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").bind(u.userId),
    db().prepare("SELECT * FROM backgrounds WHERE owner_id=? ORDER BY created_at DESC LIMIT 100").bind(u.userId),
    db().prepare("SELECT * FROM script_jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 30").bind(u.userId)]);
  return json({projects:r[0].results,avatars:r[1].results,jobs:r[2].results,publications:r[3].results,backgrounds:r[4].results.map(backgroundView),scriptJobs:r[5].results,deepseekConfigured:await deepseekConfigured(u.userId),user:{name:u.displayName},providerConfigured:await providerConfigured()});
}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
  const u=await identity(req);const b:any=await req.json();
  if(b.action==="save"){
    const p=projectSchema.parse(b.project);
    if(p.avatarId){const a=await db().prepare("SELECT id FROM avatars WHERE id=? AND owner_id=?").bind(p.avatarId,u.userId).first();if(!a)throw new AppError("Выберите своего ведущего.");}
    await projectBackground(p,u.userId);
    if(p.audioId)await ownMedia(p.audioId,u.userId);if(p.mediaId)await ownMedia(p.mediaId,u.userId);
    await db().prepare("INSERT INTO projects(id,owner_id,title,document,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,document=excluded.document,updated_at=excluded.updated_at WHERE projects.owner_id=excluded.owner_id").bind(p.id,u.userId,p.title,JSON.stringify(p),now()).run();return json({saved:true,id:p.id});
  }
  if(b.action==="avatar"){
    const a=z.object({name:z.string().trim().min(1).max(80),photoId:z.string().uuid(),consent:z.literal(true)}).parse(b);
    const m=await ownMedia(a.photoId,u.userId);if(m.kind!=="photo")throw new AppError("Выберите портрет в формате JPG или PNG.");
    const id=uid();await db().prepare("INSERT INTO avatars(id,owner_id,name,photo_id,consent_at,created_at) VALUES(?,?,?,?,?,?)").bind(id,u.userId,a.name,a.photoId,now(),now()).run();return json({id,name:a.name,photo_id:a.photoId});
  }
  if(b.action==="archive"){const id=z.string().uuid().parse(b.id);await db().prepare("UPDATE projects SET archived=1 WHERE id=? AND owner_id=?").bind(id,u.userId).run();return json({archived:true});}
  throw new AppError("Неизвестное действие.");
}catch(e){return errorResponse(e)}}
