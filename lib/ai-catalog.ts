import { z } from "zod";
import { openaiModelKind } from "./openai-contract.ts";
export const providerId=z.enum(["openai","deepseek","heygen","google","elevenlabs","shotstack"]);
export type ProviderId=z.infer<typeof providerId>;
export const providers:{id:ProviderId;name:string;tag:string;description:string;url:string}[]=[
  {id:"openai",name:"OpenAI / ChatGPT",tag:"Сценарии · изображения",description:"GPT для сценариев и GPT Image для фонов. Подключение через OpenAI API key.",url:"https://platform.openai.com/api-keys"},
  {id:"deepseek",name:"DeepSeek",tag:"Сценарии",description:"Задание, факты и структура новостного выпуска.",url:"https://platform.deepseek.com/api_keys"},
  {id:"google",name:"Google Gemini / Veo",tag:"Изображения · видео",description:"Фоны, иллюстрации и короткие видеовставки через Gemini API.",url:"https://aistudio.google.com/apikey"},
  {id:"elevenlabs",name:"ElevenLabs",tag:"Голос",description:"Озвучка текста и голос ведущего из вашей библиотеки.",url:"https://elevenlabs.io/app/settings/api-keys"},
  {id:"heygen",name:"HeyGen",tag:"Ведущий",description:"Фотоаватар с синхронизацией губ для каждой сцены.",url:"https://app.heygen.com/developers/api"},
  {id:"shotstack",name:"Shotstack",tag:"Монтаж · субтитры",description:"Сборка сцен в MP4 и автоматические субтитры по звуку.",url:"https://dashboard.shotstack.io/"},
];
export const connectionSchema=z.object({action:z.enum(["connect","check","disconnect"]),provider:providerId,key:z.string().trim().min(10).max(2000).optional()});
export const assetRequestSchema=z.object({
  operation:z.enum(["image","audio","video"]),provider:z.enum(["google","elevenlabs","openai"]),
  prompt:z.string().trim().min(3).max(5000),model:z.string().regex(/^[a-zA-Z0-9._-]{1,150}$/),
  voiceId:z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/).optional(),ratio:z.enum(["9:16","16:9","1:1"]).default("9:16"),
}).superRefine((v,c)=>{
  if(v.operation==="audio"&&(v.provider!=="elevenlabs"||!v.voiceId))c.addIssue({code:"custom",message:"Для озвучки выберите ElevenLabs и голос."});
  if(v.operation!=="audio"&&v.provider!=="google"&&!(v.operation==="image"&&v.provider==="openai"))c.addIssue({code:"custom",message:"Для фона выберите Google или OpenAI; для видео — Google."});
  if(v.operation==="video"&&(!v.model.startsWith("veo-")||v.ratio==="1:1"))c.addIssue({code:"custom",message:"Veo: модель veo и формат 9:16 или 16:9."});
  if(v.operation==="image"&&v.provider==="google"&&(!v.model.startsWith("gemini-")||!/image|nano-banana/.test(v.model)))c.addIssue({code:"custom",message:"Выберите модель генерации изображений."});
  if(v.provider==="openai"&&openaiModelKind(v.model)!=="image")c.addIssue({code:"custom",message:"Выберите модель GPT Image."});
});
export type AssetRequest=z.infer<typeof assetRequestSchema>;
export type AIJob={id:string;project_id:string;scene_id:string;provider:ProviderId;operation:string;status:string;signature:string;external_id:string|null;document:string;result:string|null;error:string|null;created_at:string};
export type Connection={provider:ProviderId;connected:boolean;managed?:boolean;checkedAt?:string;models?:{id:string;name:string;kind:string}[];voices?:{id:string;name:string}[];note?:string};
export const jobStates:Record<string,string>={preparing:"Подготовка ведущего",submitting:"Отправляется",processing:"Генерируется",completed:"Готово",failed:"Ошибка",unconfirmed:"Нужна проверка в сервисе",abandoned:"Закрыто вручную"};
export function resultOf(job:AIJob){try{return JSON.parse(job.result||"{}")}catch{return {}}}
