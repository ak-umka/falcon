import { identity, db, bucket, now, uid, json, errorResponse, AppError } from "@/lib/server";
export async function POST(req:Request){try{
  const u=await identity(req);const form=await req.formData();const f=form.get("file"),kind=form.get("kind");
  if(!(f instanceof File)||f.size<16||f.size>25*1024*1024)throw new AppError("Выберите файл размером до 25 MB.");
  const bytes=new Uint8Array(await f.arrayBuffer());const ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b));let mime="";
  if(kind==="photo"||kind==="background"){if(f.size>8*1024*1024)throw new AppError("Изображение должно быть не больше 8 MB.");if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime="image/jpeg";if(bytes[0]===137&&ascii(1,4)==="PNG")mime="image/png";}
  else if(kind==="video"&&ascii(4,8)==="ftyp")mime="video/mp4";
  else if(kind==="audio"){if(ascii(0,4)==="RIFF"&&ascii(8,12)==="WAVE")mime="audio/wav";if(ascii(0,3)==="ID3"||(bytes[0]===255&&(bytes[1]&224)===224))mime="audio/mpeg";}
  if(!mime)throw new AppError("Неподдерживаемый файл. Используйте JPG/PNG, MP4 или MP3/WAV.");
  const id=uid(),key=`${u.userId}/${id}`,filename=f.name.replace(/[^\p{L}\p{N}._ -]/gu,"_").slice(0,120);
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  try{await db().prepare("INSERT INTO media(id,owner_id,key,kind,mime,filename,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,u.userId,key,kind,mime,filename,f.size,now()).run();}catch(e){await bucket().delete(key);throw e;}
  return json({id,url:`/api/media/${id}`,name:filename,bytes:f.size,kind});
}catch(e){return errorResponse(e)}}
