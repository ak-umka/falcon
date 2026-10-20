import {env} from "cloudflare:workers";
import {tickQueue} from "@/lib/production-queue";
import {json,errorResponse,AppError} from "@/lib/server";
export async function POST(req:Request){try{
 const key=(env as unknown as Record<string,string>).PRODUCTION_RUNNER_TOKEN;
 const auth=req.headers.get("authorization")||"";
 if(!key||!auth.startsWith("Bearer "))throw new AppError("Нет доступа.",403);
 const enc=new TextEncoder(),hmac=await crypto.subtle.importKey("raw",enc.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
 const signed=await crypto.subtle.sign("HMAC",hmac,enc.encode(key));
 if(!await crypto.subtle.verify("HMAC",hmac,signed,enc.encode(auth.slice(7))))throw new AppError("Нет доступа.",403);
 return json(await tickQueue());
}catch(e){return errorResponse(e)}}
