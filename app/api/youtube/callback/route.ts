import {identity,AppError} from "@/lib/server";
import {completeYoutube} from "@/lib/channels";
export async function GET(req:Request){
 const url=new URL(req.url),back=new URL("/?view=radar",url.origin);
 try{
  const u=await identity(),code=url.searchParams.get("code"),state=url.searchParams.get("state");
  if(!code||!state)throw new AppError(url.searchParams.get("error")==="access_denied"?"Доступ к YouTube не выдан.":"Google не вернул код подключения.");
  back.searchParams.set("youtube",`ok:${await completeYoutube(u.userId,url.origin,code,state)}`);
 }catch(e){back.searchParams.set("youtube",`error:${e instanceof AppError?e.message:"Не удалось подключить YouTube."}`);}
 return Response.redirect(back.toString(),302);
}
