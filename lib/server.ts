import { productionOwner } from "./provider-context";
import { env } from "cloudflare:workers";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
import { connectorsForRequest } from "@/lib/connectors";
import type { Json, ConnectorResult } from "@/lib/connectors";
import { ZodError } from "zod";
export const now=()=>new Date().toISOString();export const uid=()=>crypto.randomUUID();
export function db(){if(!env.DB)throw new AppError("Хранилище ещё не подключено.",503);return env.DB;}
export function bucket(){if(!env.BUCKET)throw new AppError("Файловое хранилище ещё не подключено.",503);return env.BUCKET;}
export class AppError extends Error{constructor(message:string,public status=400,public code="invalid_request",public details?:unknown){super(message);}}
export async function identity(request?:Request){
  if(request&&request.method!=="GET"){
    const origin=request.headers.get("origin");if(!origin||origin!==new URL(request.url).origin)throw new AppError("Запрос должен быть отправлен из студии.",403);
    if(Number(request.headers.get("content-length")||0)>26*1024*1024)throw new AppError("Файл слишком большой.",413);
  }
  const user=await getChatGPTUser();if(!user)throw new AppError("Войдите через ChatGPT, чтобы открыть студию.",401,"sign_in_required");return user;
}
export const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export class ConnectorFailure extends Error{constructor(public envelope:Exclude<ConnectorResult,{status:"success"}>){super(envelope.message);}}
export function errorResponse(error:unknown){
  if(error instanceof ConnectorFailure)return json({...error.envelope,...(error.envelope.status==="reauthentication_required"?{chatGPTSignInPath:chatGPTSignInPath("/?view=channels")}:{})},400);
  if(error instanceof AppError)return json({error:error.message,code:error.code,details:error.details,...(error.status===401?{chatGPTSignInPath:chatGPTSignInPath("/")}:{})},error.status);
  if(error instanceof ZodError)return json({error:error.issues.map(e=>e.message).join("; ")},400);
  return json({error:"Операция не завершена. Обновите статус перед повторной отправкой."},500);
}
export function parseConnector(result:ConnectorResult):any{
  if(result.status!=="success")throw new ConnectorFailure(result);
  if(result.result.structuredContent!==undefined)return result.result.structuredContent;
  for(const c of result.result.content)if(c.type==="text"&&typeof c.text==="string"){try{return JSON.parse(c.text)}catch{}}
  throw new AppError("Сервис не вернул подтверждённый результат.",502,"unconfirmed");
}
export const SOCIAL_ID="asdk_app_6aa1e36d0a108191b38d12b95e3d5568";
export async function social(action:string,args:Record<string,Json>){
  if(!["list_channels","create_media_upload","finalize_media_upload","upload_media","create_post","publish_post","get_post"].includes(action))throw new AppError("Недоступная операция.",403);
  const client=connectorsForRequest();const context=await client.getContext();let name=action;
  if(context.status==="success"){
    const declared=context.connectors.find(c=>c.connectorId===SOCIAL_ID);
    if(declared?.tools){const found=declared.tools.find(t=>t.actionName===action||t.actionName===`bulkpublish_${action}`||t.actionName===`mcp__codex_apps__bulkpublish_${action}`);
      if(!found)throw new AppError("Операция недоступна в текущем подключении BulkPublish.",403,"tool_not_allowed");name=found.actionName;}
  }
  const result=await client.invoke(SOCIAL_ID,name,args);return {data:parseConnector(result),envelope:result};
}
export async function providerConfigured(){
  if((env as unknown as Record<string,string>).HEYGEN_API_KEY)return true;
  const u=await getChatGPTUser();if(!u)return false;
  return Boolean(await db().prepare("SELECT owner_id FROM connections WHERE owner_id=?").bind(u.userId).first());
}
async function encryptionKey(){
  const value=(env as unknown as Record<string,string>).PROVIDER_ENCRYPTION_KEY;
  if(!value)throw new AppError("Защищённое подключение пока недоступно.",503);
  return crypto.subtle.importKey("raw",Uint8Array.from(atob(value),c=>c.charCodeAt(0)),"AES-GCM",false,["encrypt","decrypt"]);
}
export async function encryptCredential(value:string,owner:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(owner)},await encryptionKey(),new TextEncoder().encode(value));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(data)))}`;
}
export async function decryptCredential(value:string,owner:string){
  const [iv,ciphertext]=value.split(".");
  const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(owner)},await encryptionKey(),Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0)));
  return new TextDecoder().decode(data);
}
export async function providerKey(){
  const configured=(env as unknown as Record<string,string>).HEYGEN_API_KEY;if(configured)return configured;
  const owner=productionOwner()||(await getChatGPTUser())?.userId;if(!owner)return null;
  const row=await db().prepare("SELECT ciphertext FROM connections WHERE owner_id=?").bind(owner).first<{ciphertext:string}>();if(!row)return null;
  const [iv,ciphertext]=row.ciphertext.split(".");
  const data=await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(owner)},await encryptionKey(),Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0)));
  return new TextDecoder().decode(data);
}
export async function heygen(path:string,body?:unknown,method?:string,idempotencyKey?:string){
  const key=await providerKey();if(!key)throw new AppError("Для создания видео подключите HeyGen API в настройках проекта.",503,"provider_not_configured");
  const multipart=body instanceof FormData;
  const r=await fetch(`https://api.heygen.com${path}`,{method:method||(body?"POST":"GET"),headers:{"x-api-key":key,...(!multipart?{"Content-Type":"application/json"}:{}),...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(45000)});
  const data:any=await r.json().catch(()=>({}));if(!r.ok||data.error)throw new AppError(typeof data.error?.message==="string"?data.error.message:`HeyGen вернул ошибку (${r.status}). Проверьте API-доступ и баланс.`,502,r.status>=500||r.status===408?"unconfirmed":"provider_error");return data;
}
export async function ownMedia(id:string,owner:string){const row=await db().prepare("SELECT * FROM media WHERE id=? AND owner_id=?").bind(id,owner).first<any>();if(!row)throw new AppError("Файл не найден.",404);return row;}
export async function uploadAsset(id:string,owner:string){
  const row=await ownMedia(id,owner);const file=await bucket().get(row.key);if(!file)throw new AppError("Файл не найден.",404);
  const form=new FormData();form.append("file",new Blob([await file.arrayBuffer()],{type:row.mime}),row.filename);
  const r=await heygen("/v3/assets",form);const asset=r.data?.id||r.data?.asset_id;if(typeof asset!=="string")throw new AppError("HeyGen не вернул ID файла.",502,"unconfirmed");return asset;
}
