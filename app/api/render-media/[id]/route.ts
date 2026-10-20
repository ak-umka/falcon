import { db,bucket,AppError,errorResponse } from "@/lib/server";
import { verifyRenderGrant } from "@/lib/render-grants";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,url=new URL(req.url);
 if(!await verifyRenderGrant(id,url.searchParams.get("expires")||"",url.searchParams.get("signature")||""))throw new AppError("Ссылка недействительна или истекла.",403);
 const media=await db().prepare("SELECT key,mime FROM media WHERE id=?").bind(id).first<{key:string;mime:string}>();if(!media)throw new AppError("Материал не найден.",404);
 const file=await bucket().get(media.key,{range:req.headers});if(!file)throw new AppError("Файл не найден.",404);
 const headers=new Headers({"Content-Type":media.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes","Referrer-Policy":"no-referrer"});let status=200;
 if(file.range&&"offset" in file.range){const range=file.range as {offset:number;length:number};headers.set("Content-Range",`bytes ${range.offset}-${range.offset+range.length-1}/${file.size}`);headers.set("Content-Length",String(range.length));status=206;}else headers.set("Content-Length",String(file.size));
 return new Response(file.body,{status,headers});
}catch(e){return errorResponse(e)}}
