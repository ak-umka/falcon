import { z } from "zod";
import { identity, db, now, json, errorResponse, encryptCredential, AppError } from "@/lib/server";
import { checkDeepseek, deepseekKey } from "@/lib/deepseek";
export async function POST(req:Request){try{
  const u=await identity(req),b=z.object({action:z.enum(["connect","check","disconnect"]),key:z.string().trim().min(10).max(2000).optional()}).parse(await req.json());
  if(b.action==="disconnect"){await db().prepare("DELETE FROM ai_connections WHERE owner_id=?").bind(u.userId).run();return json({connected:false});}
  if(b.action==="check")return json({connected:true,models:await checkDeepseek(await deepseekKey(u.userId))});
  if(!b.key)throw new AppError("Введите API-ключ DeepSeek.");
  const models=await checkDeepseek(b.key),ciphertext=await encryptCredential(b.key,`${u.userId}:deepseek`);
  await db().prepare("INSERT INTO ai_connections(owner_id,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at").bind(u.userId,ciphertext,now()).run();
  return json({connected:true,models});
}catch(e){return errorResponse(e)}}
