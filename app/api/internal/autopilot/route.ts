import {z} from "zod";
import {json,errorResponse,AppError} from "@/lib/server";
import {requireRunner} from "@/lib/runner-auth";
import {autopilotTick,claimRender,completeRender,failRender,renderPhoto} from "@/lib/autopilot";
// Внешний runner: шаг автопилота, получение задания монтажа, загрузка готового MP4.
export async function POST(req:Request){try{
 await requireRunner(req);
 if((req.headers.get("content-type")||"").startsWith("multipart/form-data")){
  const form=await req.formData(),file=form.get("file");
  if(!(file instanceof File))throw new AppError("Нет файла ролика.");
  return json(await completeRender(z.string().uuid().parse(form.get("id")),z.string().uuid().parse(form.get("token")),file));
 }
 const b=z.object({action:z.enum(["tick","claim","fail","photo"]),id:z.string().uuid().optional(),token:z.string().uuid().optional(),error:z.string().max(500).optional()}).parse(await req.json());
 if(b.action==="tick")return json(await autopilotTick());
 if(b.action==="claim")return json({task:await claimRender()});
 if(!b.id||!b.token)throw new AppError("Нет задания.");
 if(b.action==="photo")return await renderPhoto(b.id,b.token);
 await failRender(b.id,b.token,b.error||"Монтаж не удался.");return json({ok:true});
}catch(e){return errorResponse(e)}}
