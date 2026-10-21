import {identity,json,errorResponse} from "@/lib/server";
import {youtubeConnectURL} from "@/lib/channels";
// Только POST: identity() для не-GET запросов проверяет Origin (same-origin), поэтому чужая страница
// не может запустить подключение YouTube от имени пользователя (CSRF). Браузер переходит по url сам.
export async function POST(req:Request){try{
 const u=await identity(req);return json({url:await youtubeConnectURL(u.userId,new URL(req.url).origin)});
}catch(e){return errorResponse(e)}}
export function GET(){return json({error:"Используйте кнопку «Подключить» в студии."},405)}
