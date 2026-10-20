export function openaiModelKind(id:string):"image"|"text"|null {
  if(!/^[a-zA-Z0-9._-]{1,150}$/.test(id))return null;
  if(/^gpt-image-[12](?:[.-]|$)/.test(id)||id==="chatgpt-image-latest")return "image";
  if(/^gpt-(?:4\.1|4o|5|6)(?:[.-]|$)/.test(id)&&!/(audio|realtime|transcribe|tts|search|codex|computer|deep-research|image)/.test(id))return "text";
  return null;
}
export function openaiImageSize(ratio:string){return ratio==="1:1"?"1024x1024":ratio==="16:9"?"1536x1024":"1024x1536";}
export function responseText(data:any):string {
  if(data?.status!=="completed"||!Array.isArray(data.output))throw new Error("OpenAI не завершил сценарий. Проверьте задачу перед повтором.");
  const content=data.output.filter((x:any)=>x.type==="message").flatMap((x:any)=>x.content||[]);
  if(content.some((x:any)=>x.type==="refusal"))throw new Error("OpenAI отказался создавать этот сценарий. Измените задание.");
  const text=content.filter((x:any)=>x.type==="output_text"&&typeof x.text==="string").map((x:any)=>x.text).join("");
  if(!text)throw new Error("OpenAI вернул пустой сценарий.");return text;
}
