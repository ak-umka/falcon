import { env } from "cloudflare:workers";
import { AppError } from "./server";
/** Доступ внешнего runner: Bearer PRODUCTION_RUNNER_TOKEN, сравнение за постоянное время через HMAC. */
export async function requireRunner(req:Request){
 const key=(env as unknown as Record<string,string>).PRODUCTION_RUNNER_TOKEN;
 const auth=req.headers.get("authorization")||"";
 if(!key||!auth.startsWith("Bearer "))throw new AppError("Нет доступа.",403);
 const enc=new TextEncoder(),hmac=await crypto.subtle.importKey("raw",enc.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
 const signed=await crypto.subtle.sign("HMAC",hmac,enc.encode(key));
 if(!await crypto.subtle.verify("HMAC",hmac,signed,enc.encode(auth.slice(7))))throw new AppError("Нет доступа.",403);
}
