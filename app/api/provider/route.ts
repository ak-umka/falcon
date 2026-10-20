import { z } from "zod";import { identity, db, now, json, errorResponse, AppError, encryptCredential, heygen } from "@/lib/server";
export async function POST(req:Request){try{
  const u=await identity(req);const b=z.object({action:z.enum(["connect","check","disconnect"]),key:z.string().min(10).max(2000).optional()}).parse(await req.json());
  if(b.action==="disconnect"){await db().prepare("DELETE FROM connections WHERE owner_id=?").bind(u.userId).run();return json({connected:false});}
  if(b.action==="check"){await heygen("/v3/users/me");return json({connected:true});}
  if(!b.key)throw new AppError("Введите API key HeyGen.");
  const r=await fetch("https://api.heygen.com/v3/users/me",{headers:{"x-api-key":b.key},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new AppError(`HeyGen не подтвердил доступ (${r.status}). Проверьте ключ и разрешения.`);
  const ciphertext=await encryptCredential(b.key,u.userId);
  await db().prepare("INSERT INTO connections(owner_id,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at").bind(u.userId,ciphertext,now()).run();
  return json({connected:true});
}catch(e){return errorResponse(e)}}
