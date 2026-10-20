import { identity, heygen, json, errorResponse } from "@/lib/server";
export async function GET(req:Request){try{
  await identity();const url=new URL(req.url);const language=({ru:"Russian",en:"English",uz:"Uzbek"} as Record<string,string>)[url.searchParams.get("language")||"ru"]||"Russian";
  const query=new URLSearchParams({language,limit:"50",type:url.searchParams.get("private")==="true"?"private":"public"});
  const token=url.searchParams.get("token");if(token&&token.length<2000)query.set("token",token);
  const r=await heygen(`/v3/voices?${query}`);return json({voices:Array.isArray(r.data)?r.data:r.data?.voices||[],nextToken:r.next_token||r.data?.next_token||null});
}catch(e){return errorResponse(e)}}
