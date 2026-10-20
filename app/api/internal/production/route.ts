import {tickQueue} from "@/lib/production-queue";
import {json,errorResponse} from "@/lib/server";
import {requireRunner} from "@/lib/runner-auth";
export async function POST(req:Request){try{
 await requireRunner(req);
 return json(await tickQueue());
}catch(e){return errorResponse(e)}}
