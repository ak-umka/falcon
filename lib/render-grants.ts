import { env } from "cloudflare:workers";
import { AppError,ownMedia } from "./server";
const encoder=new TextEncoder();
/** Ключ подписей (ссылки рендера, OAuth state). Отдельный от PROVIDER_ENCRYPTION_KEY: его смена не затрагивает зашифрованные ключи. */
export function signingSecret(){
 const vars=env as unknown as Record<string,string>,secret=vars.SIGNING_KEY;
 if(!secret||secret.length<32)throw new AppError("Не настроен SIGNING_KEY (секрет сайта, не короче 32 символов).",503);
 if(secret===vars.PROVIDER_ENCRYPTION_KEY)throw new AppError("SIGNING_KEY должен отличаться от PROVIDER_ENCRYPTION_KEY.",503);
 return secret;
}
async function signingKey(){
 return crypto.subtle.importKey("raw",encoder.encode(`render-media-v1:${signingSecret()}`),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function renderURL(owner:string,id:string){
 await ownMedia(id,owner);const expires=Math.floor(Date.now()/1000)+6*3600;
 const signature=await crypto.subtle.sign("HMAC",await signingKey(),encoder.encode(`${id}:${expires}`));
 const hex=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,"0")).join("");
 const origin=(env as unknown as Record<string,string>).SITE_PUBLIC_URL||"https://falcon-news-studio.zafar-safaro-0684.chatgpt.site";
 return `${origin}/api/render-media/${id}?expires=${expires}&signature=${hex}`;
}
export async function verifyRenderGrant(id:string,expires:string,signature:string){
 if(!/^[0-9a-f-]{36}$/.test(id)||!/^\d{10}$/.test(expires)||!/^\w{64}$/.test(signature)||!Number.isSafeInteger(Number(expires))||Number(expires)<Date.now()/1000||Number(expires)>Date.now()/1000+6*3600+60)return false;
 if(!/^[0-9a-f]{64}$/.test(signature))return false;
 return crypto.subtle.verify("HMAC",await signingKey(),Uint8Array.from(signature.match(/../g)!,v=>parseInt(v,16)),encoder.encode(`${id}:${expires}`));
}
