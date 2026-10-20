import { identity, social, json, errorResponse } from "@/lib/server";
export async function POST(req:Request){try{await identity(req);const r=await social("list_channels",{active:true});return json(r.envelope);}catch(e){return errorResponse(e)}}
