import { z } from "zod";import { identity, db, json, errorResponse, AppError, social } from "@/lib/server";
export async function POST(req:Request){try{
  const u=await identity(req);const {id}=z.object({id:z.string().uuid()}).parse(await req.json());
  const row=await db().prepare("SELECT * FROM publications WHERE id=? AND owner_id=?").bind(id,u.userId).first<any>();if(!row)throw new AppError("Публикация не найдена.",404);
  if(!row.external_id)return json({publication:row});
  const result=await social("get_post",{postId:row.external_id});const status=result.data.approvalStatus==="pending"?"awaiting_approval":result.data.status||"unconfirmed";
  await db().prepare("UPDATE publications SET status=?,result=?,error=NULL WHERE id=?").bind(status,JSON.stringify(result.envelope),id).run();
  return json({publication:{...row,status,result:JSON.stringify(result.envelope),error:null},provider:result.envelope});
}catch(e){return errorResponse(e)}}
