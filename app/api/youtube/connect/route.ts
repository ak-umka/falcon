import {identity,errorResponse} from "@/lib/server";
import {youtubeConnectURL} from "@/lib/channels";
export async function GET(req:Request){try{
 const u=await identity();return Response.redirect(await youtubeConnectURL(u.userId,new URL(req.url).origin),302);
}catch(e){return errorResponse(e)}}
