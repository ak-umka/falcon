"use client";
import { useEffect,useState } from "react";
import { ArrowRight,CheckCircle2,ExternalLink,KeyRound,Loader2,RefreshCw,ShieldCheck,SlidersHorizontal } from "lucide-react";
import { providers,type Connection,type ProviderId } from "@/lib/ai-catalog";
import { request } from "@/lib/studio-client";

export default function AIHub({onChange,onStudio,onError,notify}:{onChange:()=>void;onStudio:()=>void;onError:(e:unknown)=>unknown;notify:(s:string)=>void}){
  const [connections,setConnections]=useState<Connection[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=async()=>{setLoading(true);try{setConnections((await request("/api/ai/connections")).connections);setError("")}catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить подключения");onError(e)}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const changed=(c:Connection)=>{setConnections(a=>[...a.filter(x=>x.provider!==c.provider),c]);onChange()};
  return <><div className="page-heading"><div><div className="eyebrow">FALCON PRODUCTION NETWORK</div><h1>Центр AI-подключений</h1><p>Каждый сервис отвечает за свой этап. Управление выпуском остаётся в студии.</p></div><button className="btn" onClick={()=>void load()} disabled={loading}><RefreshCw size={17} className={loading?"spin":""}/>Обновить</button></div>
    <div className="ai-pipeline"><span>01 · Сценарий<b>GPT / DeepSeek</b></span><ArrowRight/><span>02 · Материалы<b>OpenAI / Google / ElevenLabs</b></span><ArrowRight/><span>03 · Ведущий<b>HeyGen</b></span><ArrowRight/><span>04 · Выпуск<b>Shotstack</b></span></div>
    <div className="ai-security"><ShieldCheck size={21}/><p>Ключи хранятся зашифрованными на сервере. Проверка подключения не запускает генерацию. Создание материалов оплачивается отдельно в ваших аккаунтах.</p></div>
    {error&&<p className="alert error">{error}</p>}
    <div className="ai-provider-grid">{providers.map(p=><ProviderCard key={p.id} provider={p} connection={connections.find(c=>c.provider===p.id)} onChange={changed} onError={onError} notify={notify}/>)}</div>
    <section className="panel ai-flow-note"><div><h3>Google Flow · ручной монтаж</h3><p>Flow открывается отдельно. Gemini API использует ключ Google AI Studio и отдельный API-биллинг. Подписка Flow сама по себе не подтверждает доступ к API.</p></div><a className="btn" href="https://flow.google.com/" target="_blank" rel="noreferrer">Открыть Flow<ExternalLink size={16}/></a></section>
    <section className="ai-next"><div><SlidersHorizontal/><h3>Подключения готовы? Соберите первый выпуск</h3><p>Выберите ведущего и голос, проверьте сцены и запустите генерацию.</p></div><button className="btn primary" onClick={onStudio}>К сценам выпуска<ArrowRight size={17}/></button></section></>;
}
function ProviderCard({provider:p,connection:c,onChange,onError,notify}:{provider:typeof providers[number];connection?:Connection;onChange:(c:Connection)=>void;onError:(e:unknown)=>unknown;notify:(s:string)=>void}){
  const [key,setKey]=useState(""),[busy,setBusy]=useState(""),[opened,setOpened]=useState(false);
  const act=async(action:string)=>{setBusy(action);try{const r=await request("/api/ai/connections",{provider:p.id,action,...(action==="connect"?{key}:{})});onChange(r.connection);setKey("");if(action==="connect")setOpened(false);notify(action==="disconnect"?(r.connection.connected?"Личный ключ удалён. Серверное подключение остаётся активным.":`${p.name}: ключ удалён.`):`${p.name}: доступ проверен. Платная генерация не запускалась.`)}catch(e){onError(e)}finally{setBusy("")}};
  return <section className={`panel ai-provider ${c?.connected?"is-connected":""}`}><div className="ai-provider-head"><span className={`ai-letter ${p.id}`}>{p.name.slice(0,1)}</span><span className={`connection-pill ${c?.connected?"connected":""}`}>{c?c.connected?"Ключ сохранён":"Не подключён":"Загрузка…"}</span></div><small className="ai-category">{p.tag}</small><h2>{p.name}</h2><p>{p.description}</p>{c?.checkedAt&&<small className="small-muted">Проверка: {new Date(c.checkedAt).toLocaleString("ru-RU")}</small>}
    {p.id==="openai"&&<p className="ai-provider-note">Нужен API key из OpenAI Platform и доступный API-баланс. Вход в ChatGPT для этого подключения не используется.</p>}{c?.note&&<p className="ai-provider-note">{c.note}</p>}
    {c?.models?.length? <div className="ai-model-count"><CheckCircle2 size={14}/>{c.models.length} моделей в каталоге{c.voices?` · ${c.voices.length} голосов`:""}</div>:null}
    <div className="ai-provider-actions"><button className={c?.connected?"btn":"btn primary"} onClick={()=>setOpened(!opened)} disabled={!!busy}><KeyRound size={15}/>{c?.connected?"Заменить ключ":"Подключить"}</button>{c?.connected&&<button className="icon-btn" title="Проверить доступ" aria-label={`Проверить ${p.name}`} onClick={()=>void act("check")} disabled={!!busy}><RefreshCw size={17} className={busy==="check"?"spin":""}/></button>}<a href={p.url} target="_blank" rel="noreferrer" className="icon-btn" aria-label={`Кабинет ${p.name}`}><ExternalLink size={17}/></a></div>
    {opened&&<form className="ai-key-form" onSubmit={e=>{e.preventDefault();void act("connect")}}><label className="field-label">API-ключ<input type="password" autoComplete="new-password" spellCheck={false} value={key} onChange={e=>setKey(e.target.value)} maxLength={2000} placeholder="Вставьте ключ из кабинета"/></label><button className="btn primary" disabled={!!busy||key.trim().length<10}>{busy==="connect"?<Loader2 size={16} className="spin"/>:<ShieldCheck size={16}/>}Проверить и сохранить</button></form>}
    {c?.connected&&<button className="text-btn ai-remove" disabled={!!busy} onClick={()=>void act("disconnect")}>Отключить личный ключ</button>}</section>;
}
