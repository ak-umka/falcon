import { z } from "zod";

export const sceneSchema = z.object({
  id: z.string().uuid(), text: z.string().trim().max(4000),
  visual: z.string().trim().max(2000).default(""),
  backgroundId: z.string().uuid().nullable().default(null),
  kind:z.enum(["presenter","video","image"]).default("presenter"),
  mediaId:z.string().uuid().nullable().default(null),audioId:z.string().uuid().nullable().default(null),
  duration:z.number().min(0.1).max(120).default(8),trim:z.number().min(0).max(1800).default(0),
  mute:z.boolean().default(false),
});
export type ProductionScene = z.infer<typeof sceneSchema>;
export const productionFields = {
  scenes: z.array(sceneSchema).max(12).refine(s=>new Set(s.map(x=>x.id)).size===s.length,"ID сцен должны быть уникальными.").default([]),
  narration: z.enum(["heygen", "elevenlabs"]).default("heygen"),
  narrationVoice: z.string().max(150).default(""),
  narrationModel: z.string().max(150).default(""),
  mediaSignature: z.string().max(100).default(""),
};
type ProductionProject = { script:string; language:string; avatarId:string|null; voiceId:string; ratio:string; background:string; backgroundId:string|null; captions:boolean; scenes:ProductionScene[]; narration:string; narrationVoice:string; narrationModel:string;audioId?:string|null;voiceMode?:string };

// A deterministic content fingerprint; not a security token. Full inputs are also stored in job documents.
export function fingerprint(value:unknown):string {
  const s=JSON.stringify(value);let a=2166136261,b=5381;
  for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}
  return `v1-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}-${s.length}`;
}
export function sceneInput(p:ProductionProject,s:ProductionScene){
  if(s.kind&&s.kind!=="presenter")return {kind:s.kind,mediaId:s.mediaId,audioId:s.audioId,duration:s.duration,trim:s.trim,mute:s.mute,ratio:p.ratio};
  return {text:s.text,language:p.language,avatarId:p.avatarId,voiceId:p.narration==="heygen"?p.voiceId:p.narrationVoice,
    narration:p.narration,model:p.narrationModel,ratio:p.ratio,background:s.backgroundId?"scene":p.background,backgroundId:s.backgroundId||p.backgroundId};
}
export function sceneSignature(p:ProductionProject,s:ProductionScene){return fingerprint(sceneInput(p,s));}
export function videoSignature(p:ProductionProject){return fingerprint({script:p.script,audioId:p.audioId,voiceMode:p.voiceMode,language:p.language,avatar:p.avatarId,voice:p.voiceId,ratio:p.ratio,background:p.background,backgroundId:p.backgroundId,captions:p.captions,narration:p.narration,narrationVoice:p.narrationVoice,narrationModel:p.narrationModel,scenes:p.scenes.map(s=>({id:s.id,input:sceneInput(p,s)}))});}
export function splitScenes(script:string):ProductionScene[]{
  const parts=script.trim().split(/(?<=[.!?。！？])\s+|\n\s*\n/u).filter(Boolean),groups:string[]=[];let current="";
  for(const part of parts){if(current&&current.split(/\s+/).length>=28&&groups.length<11){groups.push(current);current="";}current+=(current?" ":"")+part;}
  if(current)groups.push(current);
  return groups.map(text=>sceneSchema.parse({id:crypto.randomUUID(),text,visual:"",backgroundId:null}));
}
export type AssemblyClip={url:string;duration:number;kind?:"video"|"image";trim?:number;audioUrl?:string;mute?:boolean};
export function assemblyPayload(clips:AssemblyClip[],ratio:string,captions:boolean){
  if(!clips.length||clips.some(c=>!Number.isFinite(c.duration)||c.duration<=0))throw new Error("Не подтверждена длительность сцен.");
  let start=0;const videos:any[]=[],audio:any[]=[],subtitleClips:any[]=[];
  clips.forEach((c,i)=>{
    const alias=`scene-${i}`,kind=c.kind||"video";
    videos.push({alias,asset:{type:kind,src:c.url,...(kind==="video"?{trim:c.trim||0,volume:c.audioUrl||c.mute?0:1}:{})},start,length:c.duration,fit:"cover"});
    if(c.audioUrl)audio.push({alias:`voice-${i}`,asset:{type:"audio",src:c.audioUrl},start,length:c.duration});
    if(captions&&(c.audioUrl||kind==="video"&&!c.mute))subtitleClips.push({asset:{type:"rich-caption",src:`alias://${c.audioUrl?`voice-${i}`:alias}`,font:{family:"Roboto",size:32,color:"#ffffff"},background:{color:"#101826",opacity:0.7,padding:10}},position:"bottom",offset:{y:0.08},start,length:c.duration});
    start+=c.duration;
  });
  return {timeline:{background:"#101826",tracks:[...(subtitleClips.length?[{clips:subtitleClips}]:[]),{clips:videos},...(audio.length?[{clips:audio}]:[])]},output:{format:"mp4",resolution:"hd",aspectRatio:ratio,fps:25}};
}
export function sameRenderedVersion(saved:ProductionProject,rendered:ProductionProject){return videoSignature(saved)===videoSignature(rendered);}
