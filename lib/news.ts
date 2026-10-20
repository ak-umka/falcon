import { z } from "zod";
import { defaultSceneRecipe, sceneRecipeSchema } from "./backgrounds.ts";
import { productionFields } from "./production.ts";
import { briefSchema } from "./script-generator.ts";
export const platforms = ["facebook", "instagram", "tiktok", "telegram"] as const;
export type Platform = typeof platforms[number];
export const projectSchema = z.object({
  ...productionFields,
  id: z.string().uuid(), title: z.string().trim().min(1).max(120), script: z.string().max(12000), language: z.enum(["ru", "en", "uz"]),
  avatarId: z.string().uuid().nullable(), voiceId: z.string().max(150), voiceMode: z.enum(["tts", "audio"]), audioId: z.string().uuid().nullable(),
  ratio: z.enum(["9:16", "16:9", "1:1"]), background: z.enum(["original", "navy", "ivory", "slate", "scene", "recipe"]),
  backgroundId: z.string().uuid().nullable().default(null), backgroundRecipe: sceneRecipeSchema.default(defaultSceneRecipe),
  brief: briefSchema.nullable().default(null), visualDirection: z.string().max(3000).default(""),
  factChecks: z.array(z.string().max(400)).max(12).default([]), flowPrompt: z.string().max(24000).default(""),
  flowProjectUrl: z.string().max(2000).default(""), videoProvider: z.enum(["flow", "heygen"]).default("flow"),
  captions: z.boolean(), caption: z.string().max(2200), mediaId: z.string().uuid().nullable(),
});
export type Project = z.infer<typeof projectSchema>;
export const backgrounds = { original: "#151d2b", navy: "#111e34", ivory: "#e9e5dd", slate: "#33383e", scene: "#151d2b", recipe: "#151d2b" };
export function wordCount(text: string) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
export function estimateSeconds(text: string) { return Math.ceil(wordCount(text) / 135 * 60); }
export function timecode(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2,"0")}:${Math.floor(seconds % 60).toString().padStart(2,"0")}`; }
export function cleanScript(text: string) { return text.replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").replace(/ +([,.;!?])/g,"$1").trim(); }
export function blankProject(): Project { return projectSchema.parse({ id: crypto.randomUUID(), title:"Новый выпуск", script:"", language:"ru", avatarId:null, voiceId:"", voiceMode:"tts", audioId:null, ratio:"9:16", background:"original", backgroundId:null, backgroundRecipe:{...defaultSceneRecipe}, captions:true, caption:"", mediaId:null }); }
export function checkPublication(input: { selected: string[]; caption: string; bytes: number; ratio?: string }) {
  const errors: string[] = [];
  if (!input.selected.length) errors.push("Выберите хотя бы один канал.");
  if (input.caption.length > 2200) errors.push("Описание должно быть не длиннее 2200 символов.");
  if (input.selected.includes("telegram") && input.caption.length > 1024) errors.push("Для Telegram сократите описание до 1024 символов.");
  if (input.selected.includes("telegram") && input.bytes > 20 * 1024 * 1024) errors.push("Для Telegram через BulkPublish нужен MP4 размером до 20 MB.");
  if (input.ratio && input.ratio !== "9:16" && input.selected.some(p => ["tiktok", "instagram", "facebook"].includes(p))) errors.push("Для публикации Reels и TikTok подготовьте вертикальный ролик 9:16.");
  return errors;
}
export const publishSchema = z.object({
  projectId: z.string().uuid(), requestKey: z.string().uuid(), jobId: z.string().uuid().nullable(), mediaId: z.string().uuid().nullable(),
  channels: z.array(z.object({ channelId: z.number().int().positive(), platform: z.enum(platforms) })).min(1).max(12),
  caption: z.string().max(2200), mode: z.enum(["now", "schedule"]), scheduledAt: z.string().datetime().optional(), timezone: z.string().max(80),
  privacy: z.enum(["SELF_ONLY", "PUBLIC", "FRIENDS"]), reviewed: z.literal(true),
  width: z.number().int().min(1).max(8000), height: z.number().int().min(1).max(8000), duration: z.number().positive().max(1800),
}).refine(d => Boolean(d.jobId) !== Boolean(d.mediaId), "Выберите один готовый ролик.")
  .refine(d => d.mode !== "schedule" || !!d.scheduledAt && new Date(d.scheduledAt).getTime() > Date.now() + 60_000, "Выберите будущее время публикации.");
export function publicationPayload(d: z.infer<typeof publishSchema>, mediaFileId: number) {
  return { content:d.caption, channels:d.channels, mediaFileIds:[mediaFileId], postFormat:"video", status:d.mode==="schedule"?"scheduled":"draft", timezone:d.timezone,
    ...(d.mode==="schedule"?{scheduledAt:d.scheduledAt}:{}), postTypeOverrides:{facebook:"reel",instagram:"reel",tiktok:"video",telegram:"post"},
    platformSpecific:{tiktok:{privacyLevel:d.privacy,isAigc:true,disableDuet:true,disableStitch:true}} };
}
