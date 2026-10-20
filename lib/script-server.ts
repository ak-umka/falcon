import { db } from "@/lib/server";
export async function expireScriptJobs(owner:string){
  await db().prepare("UPDATE script_jobs SET status='unconfirmed',error=? WHERE owner_id=? AND status='generating' AND created_at<?")
    .bind("Подтверждение не получено. AI-сервис мог обработать запрос. Повторная генерация создаст новый платный запрос.",owner,new Date(Date.now()-240000).toISOString()).run();
}
export async function scriptJobResponse(row:any,owner:string){
  const project=row.status==="completed"?await db().prepare("SELECT document FROM projects WHERE id=? AND owner_id=?").bind(row.project_id,owner).first<{document:string}>():null;
  return {job:row,project:project?JSON.parse(project.document):null};
}
