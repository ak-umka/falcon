import { identity, ownMedia, bucket, errorResponse, AppError } from "@/lib/server";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
  const u=await identity();const {id}=await params;const m=await ownMedia(id,u.userId);const file=await bucket().get(m.key,{range:req.headers});if(!file)throw new AppError("Файл не найден.",404);
  const h=new Headers({"Content-Type":m.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes","Content-Disposition":new URL(req.url).searchParams.get("download")==="1"?`attachment; filename="${String(m.filename).replace(/[^a-zA-Z0-9._-]/g,"_")}"`:"inline"});let status=200;
  if(file.range&&"offset" in file.range){const r=file.range as {offset:number;length:number};h.set("Content-Range",`bytes ${r.offset}-${r.offset+r.length-1}/${file.size}`);h.set("Content-Length",String(r.length));status=206;}else h.set("Content-Length",String(file.size));
  return new Response(file.body,{status,headers:h});
}catch(e){return errorResponse(e)}}
