import { identity,json,errorResponse,AppError } from "@/lib/server";
import { connectionSchema } from "@/lib/ai-catalog";
import { connections,connect,disconnect,mediaKey } from "@/lib/ai-server";
export async function GET(){try{const u=await identity();return json({connections:await connections(u.userId)})}catch(e){return errorResponse(e)}}
export async function POST(req:Request){try{
  const u=await identity(req),b=connectionSchema.parse(await req.json());
  if(b.action==="disconnect")return json({connection:await disconnect(u.userId,b.provider)});
  const key=b.action==="check"?await mediaKey(u.userId,b.provider):b.key;
  if(!key)throw new AppError("Введите API-ключ.");return json({connection:await connect(u.userId,b.provider,key)});
}catch(e){return errorResponse(e)}}
