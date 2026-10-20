import {z} from "zod";
import {identity,db,json,errorResponse,AppError} from "@/lib/server";
import {deepseekConfigured} from "@/lib/deepseek";
import {collectArticles,lastCollected,verifiedStories} from "@/lib/radar";
import {autopilotSettings,saveAutopilotSettings,draftStory,freshStories,radarItems,publishItem,rejectItem,storiesToday} from "@/lib/autopilot";
import {channelStatus,connectTelegram,disconnectChannel} from "@/lib/channels";
export async function GET(){try{
 const u=await identity();
 const [settings,stories,items,channels,deepseek,collected,runner,today]=await Promise.all([autopilotSettings(u.userId),freshStories(u.userId),radarItems(u.userId),channelStatus(u.userId),deepseekConfigured(u.userId),lastCollected(),
  db().prepare("SELECT updated_at FROM worker_health WHERE id='runner'").first<{updated_at:string}>(),storiesToday(u.userId)]);
 return json({settings,stories,items,channels,deepseekConfigured:deepseek,lastCollected:collected,runnerSeen:runner?.updated_at||null,today});
}catch(e){return errorResponse(e)}}
const action=z.discriminatedUnion("action",[
 z.object({action:z.literal("settings"),settings:z.unknown()}),
 z.object({action:z.literal("scan")}),
 z.object({action:z.literal("draft"),storyKey:z.string().regex(/^[0-9a-f]{12}$/),consent:z.literal(true,{errorMap:()=>({message:"Подтвердите платный запрос DeepSeek."})})}),
 z.object({action:z.literal("publish"),itemId:z.string().uuid(),channels:z.array(z.enum(["telegram","youtube"])).min(1,"Выберите площадку.").max(2)}),
 z.object({action:z.literal("reject"),itemId:z.string().uuid()}),
 z.object({action:z.literal("telegram"),token:z.string().trim().max(120),chat:z.string().trim().min(2).max(200)}),
 z.object({action:z.literal("disconnect"),channel:z.enum(["telegram","youtube"])}),
]);
export async function POST(req:Request){try{
 const u=await identity(req),b=action.parse(await req.json());
 if(b.action==="settings")return json({settings:await saveAutopilotSettings(u.userId,b.settings)});
 if(b.action==="scan"){const last=await lastCollected();if(last&&Date.now()-Date.parse(last)<120000)throw new AppError("Ленты обновлялись меньше двух минут назад.",429);return json({collected:await collectArticles(true)});}
 if(b.action==="draft"){const story=(await verifiedStories()).find(s=>s.key===b.storyKey);if(!story)throw new AppError("История больше не в окне радара. Обновите список.",404);return json(await draftStory(u.userId,story,{...await autopilotSettings(u.userId)}));}
 if(b.action==="publish")return json(await publishItem(u.userId,b.itemId,b.channels));
 if(b.action==="reject"){await rejectItem(u.userId,b.itemId);return json({ok:true});}
 if(b.action==="telegram")return json(await connectTelegram(u.userId,b.token,b.chat));
 await disconnectChannel(u.userId,b.channel);return json({ok:true});
}catch(e){return errorResponse(e)}}
