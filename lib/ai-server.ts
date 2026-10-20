import { AppError, db, bucket, now, uid, encryptCredential, decryptCredential, providerKey, providerConfigured, ownMedia } from "./server";
import { checkDeepseek, deepseekConfigured, deepseekKey } from "./deepseek";
import { openaiModelKind } from "./openai-contract";
import type { ProviderId, Connection } from "./ai-catalog";

export async function providerFetch(provider:string,url:string,key:string,body?:unknown){
  const header=provider==="google"?"x-goog-api-key":provider==="elevenlabs"?"xi-api-key":"x-api-key";
  let r:Response;
  try{r=await fetch(url,{method:body?"POST":"GET",headers:{...(provider==="openai"?{Authorization:`Bearer ${key}`}:{[header]:key}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,redirect:"error",signal:AbortSignal.timeout(body?90000:25000)});}
  catch{throw new AppError(`${provider}: ответ не получен. Проверьте статус перед повторной генерацией.`,502,body?"unconfirmed":"provider_error");}
  if(!r.ok)throw new AppError(`${provider}: HTTP ${r.status}. Проверьте ключ, разрешения, модель и баланс.`,502,r.status>=500||r.status===408?"unconfirmed":"provider_error");
  return r;
}
export async function mediaKey(owner:string,provider:ProviderId){
  if(provider==="deepseek")return deepseekKey(owner);
  if(provider==="heygen"){const k=await providerKey();if(k)return k;}
  const r=await db().prepare("SELECT ciphertext FROM media_connections WHERE owner_id=? AND provider=?").bind(owner,provider).first<{ciphertext:string}>();
  if(!r)throw new AppError(`Подключите ${provider} в центре AI.`,503,"provider_not_configured");
  return decryptCredential(r.ciphertext,`${owner}:media:${provider}`);
}
export async function inspectProvider(provider:ProviderId,key:string):Promise<Partial<Connection>>{
  if(provider==="openai"){
    const data:any=await (await providerFetch(provider,"https://api.openai.com/v1/models",key)).json();
    if(!Array.isArray(data.data))throw new AppError("OpenAI вернул некорректный каталог моделей.",502,"invalid_output");
    const models=data.data.filter((m:any)=>typeof m.id==="string"&&openaiModelKind(m.id)).map((m:any)=>({id:m.id,name:m.id,kind:openaiModelKind(m.id)!})).sort((a:any,b:any)=>a.id.localeCompare(b.id));
    return {models,note:"Доступ к каталогу подтверждён. Генерация оплачивается через OpenAI API и требует разрешений на выбранную модель. Это не подключение истории чатов ChatGPT."};
  }
  if(provider==="deepseek")return {models:(await checkDeepseek(key)).map((id:string)=>({id,name:id,kind:"text"}))};
  if(provider==="heygen"){await providerFetch(provider,"https://api.heygen.com/v3/users/me",key);return {};}
  if(provider==="shotstack"){await providerFetch(provider,"https://api.shotstack.io/edit/v1/templates",key);return {note:"Production API. Сборка оплачивается по тарифу Shotstack."};}
  if(provider==="google"){
    const models:{id:string;name:string;kind:string}[]=[];let token="";
    for(let page=0;page<5;page++){
      const data:any=await (await providerFetch(provider,`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100${token?`&pageToken=${encodeURIComponent(token)}`:""}`,key)).json();
      for(const m of data.models||[]){const id=String(m.name||"").replace(/^models\//,"");if(/^[a-zA-Z0-9._-]+$/.test(id)&&(id.startsWith("veo-")||id.startsWith("gemini-")&&/image|nano-banana/.test(id)))models.push({id,name:String(m.displayName||id),kind:id.startsWith("veo-")?"video":"image"});}
      token=data.nextPageToken||"";if(!token)break;
    }
    return {models,note:"Доступ к каталогу подтверждён; разрешение и стоимость генерации определяет Google."};
  }
  const [m,v]=await Promise.all([
    providerFetch(provider,"https://api.elevenlabs.io/v1/models",key).then(r=>r.json()) as Promise<any>,
    providerFetch(provider,"https://api.elevenlabs.io/v2/voices?page_size=100",key).then(r=>r.json()) as Promise<any>,
  ]);
  return {models:(Array.isArray(m)?m:[]).filter(x=>x.can_do_text_to_speech).map(x=>({id:x.model_id,name:x.name,kind:"audio"})),voices:(v.voices||[]).map((x:any)=>({id:x.voice_id,name:x.name})),note:v.has_more?"Показаны первые 100 голосов. Можно ввести Voice ID вручную.":"Разрешения ключа: Models Read, Voices Read и Text to Speech."};
}
export async function connections(owner:string):Promise<Connection[]>{
  const rows=await db().prepare("SELECT provider,metadata,updated_at FROM media_connections WHERE owner_id=?").bind(owner).all<any>();
  return [{provider:"deepseek",connected:await deepseekConfigured(owner)},{provider:"heygen",connected:await providerConfigured()},...(["openai","google","elevenlabs","shotstack"] as const).map(provider=>{const row=rows.results.find(r=>r.provider===provider);return {provider,connected:!!row,...(row?{...JSON.parse(row.metadata),checkedAt:row.updated_at}:{})}})];
}
export async function connect(owner:string,provider:ProviderId,key:string){
  const meta=await inspectProvider(provider,key),stamp=now();
  if(provider==="deepseek"||provider==="heygen"){
    const table=provider==="deepseek"?"ai_connections":"connections",aad=provider==="deepseek"?`${owner}:deepseek`:owner;
    await db().prepare(`INSERT INTO ${table}(owner_id,ciphertext,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET ciphertext=excluded.ciphertext,updated_at=excluded.updated_at`).bind(owner,await encryptCredential(key,aad),stamp).run();
  }else await db().prepare("INSERT INTO media_connections(id,owner_id,provider,ciphertext,metadata,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,metadata=excluded.metadata,updated_at=excluded.updated_at")
    .bind(uid(),owner,provider,await encryptCredential(key,`${owner}:media:${provider}`),JSON.stringify(meta),stamp).run();
  return {provider,connected:true,checkedAt:stamp,...meta};
}
export async function disconnect(owner:string,provider:ProviderId){
  if(provider==="deepseek"||provider==="heygen")await db().prepare(`DELETE FROM ${provider==="deepseek"?"ai_connections":"connections"} WHERE owner_id=?`).bind(owner).run();
  else await db().prepare("DELETE FROM media_connections WHERE owner_id=? AND provider=?").bind(owner,provider).run();
  return {provider,connected:provider==="heygen"?await providerConfigured():false};
}
export async function boundedBytes(response:Response,max=25*1024*1024){
  if(!response.body)throw new AppError("Пустой ответ сервиса.",502,"invalid_output");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw new AppError("Материал превышает допустимый размер.",413,"invalid_output");}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}return bytes;
}
export async function storeBytes(id:string,owner:string,bytes:Uint8Array,mime:string,kind:string){
  if(!bytes.length)throw new AppError("Провайдер вернул пустой материал.",502,"invalid_output");
  const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":mime==="image/jpeg"?"jpg":mime==="audio/mpeg"?"mp3":"mp4",key=`${owner}/${id}`;
  await bucket().put(key,bytes,{httpMetadata:{contentType:mime}});
  await db().prepare("INSERT OR IGNORE INTO media(id,owner_id,key,kind,mime,filename,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,owner,key,kind,mime,`falcon-${id.slice(0,8)}.${ext}`,bytes.length,now()).run();return id;
}
export async function downloadMaterial(urlInput:string,provider:ProviderId,key?:string){
  let url=new URL(urlInput);
  for(let i=0;i<5;i++){
    const allowed=provider==="google"?/^(generativelanguage|storage)\.googleapis\.com$/.test(url.hostname):/(^|\.)(heygen\.ai|heygen\.com|shotstack\.io|shotstack\.org|amazonaws\.com|cloudfront\.net)$/.test(url.hostname);
    if(url.protocol!=="https:"||url.port||url.username||url.password||!allowed)throw new AppError("Сервис вернул неподтверждённый адрес файла.",502,"invalid_output");
    const r=await fetch(url,{headers:provider==="google"&&url.hostname==="generativelanguage.googleapis.com"&&key?{"x-goog-api-key":key}:{},redirect:"manual",signal:AbortSignal.timeout(90000)});
    if([301,302,303,307,308].includes(r.status)){const loc=r.headers.get("location");await r.body?.cancel();if(!loc)break;url=new URL(loc,url);continue;}
    if(!r.ok)throw new AppError("Готовый материал пока не удалось скачать. Повторите проверку статуса.",502);
    return r;
  }
  throw new AppError("Не удалось получить материал.",502);
}
export async function storeVideo(id:string,owner:string,response:Response){
  const length=Number(response.headers.get("content-length"));
  if(!response.body)throw new AppError("Провайдер не вернул MP4.",502);
  if(!Number.isSafeInteger(length)||length<=0){const bytes=await boundedBytes(response);if(String.fromCharCode(...bytes.slice(4,8))!=="ftyp")throw new AppError("Сервис вернул не MP4.",502);return storeBytes(id,owner,bytes,"video/mp4","video");}
  if(length>250*1024*1024)throw new AppError("Размер MP4 превышает 250 MB.",413);
  const key=`${owner}/${id}`,fixed=new FixedLengthStream(length);let prefix=new Uint8Array(0),verified=false;
  const validate=new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){
    if(verified){controller.enqueue(chunk);return;}
    const combined=new Uint8Array(prefix.length+chunk.length);combined.set(prefix);combined.set(chunk,prefix.length);prefix=combined;
    if(prefix.length<12)return;
    if(String.fromCharCode(...prefix.slice(4,8))!=="ftyp")throw new AppError("Сервис вернул не MP4.",502);
    verified=true;controller.enqueue(prefix);prefix=new Uint8Array(0);
  },flush(){if(!verified)throw new AppError("Сервис вернул пустой или повреждённый MP4.",502);}});
  try{await Promise.all([response.body.pipeThrough(validate).pipeTo(fixed.writable),bucket().put(key,fixed.readable,{httpMetadata:{contentType:"video/mp4"}})]);}catch(e){await bucket().delete(key);throw e;}
  await db().prepare("INSERT OR IGNORE INTO media(id,owner_id,key,kind,mime,filename,bytes,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,owner,key,"video","video/mp4",`falcon-${id.slice(0,8)}.mp4`,length,now()).run();return id;
}
