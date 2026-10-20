import { mediaKey } from "@/lib/ai-server";
import { writeOpenAIScript } from "@/lib/openai-server";
import { z } from "zod";
import { identity, db, uid, now, json, errorResponse, AppError } from "@/lib/server";
import { briefSchema, projectFromScript } from "@/lib/script-generator";
import { projectSchema } from "@/lib/news";
import { projectBackground } from "@/lib/background-server";
import { deepseekKey, writeScript } from "@/lib/deepseek";
import { expireScriptJobs, scriptJobResponse } from "@/lib/script-server";
export async function POST(req:Request){let jobId:string|undefined,owner:string|undefined;
  try{
    const u=await identity(req);owner=u.userId;const raw:any=await req.json();
    await expireScriptJobs(owner);
    const requestKey=z.string().uuid().parse(raw.requestKey);
    const existing=await db().prepare("SELECT * FROM script_jobs WHERE owner_id=? AND request_key=?").bind(owner,requestKey).first<any>();
    if(existing)return json(await scriptJobResponse(existing,owner));
    if(raw.action==="status")return json({job:null,project:null});
    if(raw.action!=="generate")throw new AppError("Неизвестное действие.");
    const brief=briefSchema.parse(raw.brief),base=projectSchema.parse(raw.project);
    if(base.avatarId&&!await db().prepare("SELECT id FROM avatars WHERE id=? AND owner_id=?").bind(base.avatarId,owner).first())throw new AppError("Ведущий не найден.",404);
    await projectBackground(base,owner);
    const key=brief.provider==="openai"?await mediaKey(owner,"openai"):await deepseekKey(owner);
    const active=await db().prepare("SELECT id FROM script_jobs WHERE owner_id=? AND status='generating'").bind(owner).first();
    if(active)throw new AppError("Предыдущий сценарий ещё создаётся. Обновите историю.",409);
    const id=uid(),projectId=uid(),created=now();
    try{await db().prepare("INSERT INTO script_jobs(id,owner_id,request_key,project_id,status,document,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id,owner,requestKey,projectId,"generating",JSON.stringify(brief),created).run();}
    catch{const duplicate=await db().prepare("SELECT * FROM script_jobs WHERE owner_id=? AND request_key=?").bind(owner,requestKey).first();if(duplicate)return json(await scriptJobResponse(duplicate,owner));throw new AppError("Другой сценарий уже создаётся. Обновите историю.",409);}
    jobId=id;
    const result=await (brief.provider==="openai"?writeOpenAIScript(brief,key):writeScript(brief,key)),project=projectSchema.parse(projectFromScript(base,brief,result,projectId));
    await db().batch([
      db().prepare("INSERT INTO projects(id,owner_id,title,document,updated_at) VALUES(?,?,?,?,?)").bind(projectId,owner,project.title,JSON.stringify(project),now()),
      db().prepare("UPDATE script_jobs SET status='completed',result=?,error=NULL WHERE id=? AND owner_id=?").bind(JSON.stringify(result),id,owner),
    ]);
    return json({project,job:{id,project_id:projectId,request_key:requestKey,status:"completed",document:JSON.stringify(brief),created_at:created}});
  }catch(e){if(jobId&&owner){const failed=e instanceof AppError&&["provider_error","invalid_output"].includes(e.code);await db().prepare("UPDATE script_jobs SET status=?,error=? WHERE id=? AND owner_id=? AND status='generating'").bind(failed?"failed":"unconfirmed",e instanceof AppError?e.message:"Ответ не подтверждён. Проверьте историю перед повторной генерацией.",jobId,owner).run().catch(()=>{});}return errorResponse(e);}
}
