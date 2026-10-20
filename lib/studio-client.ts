export class RequestError extends Error{constructor(message:string,public details:any){super(message)}}
export async function request(url:string,body?:unknown){
  const r=await fetch(url,{method:body===undefined?"GET":"POST",headers:body instanceof FormData?undefined:body===undefined?undefined:{"Content-Type":"application/json"},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
  const d:any=await r.json().catch(()=>({error:"Сервер вернул неожиданный ответ."}));
  if(!r.ok||d.error||d.status&&d.status!=="success"&&d.message)throw new RequestError(d.error||d.message||"Не удалось выполнить действие.",d);
  return d;
}
export function downloadText(text:string,name:string,type="text/plain;charset=utf-8"){
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
