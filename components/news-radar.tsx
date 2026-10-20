"use client";
import {useEffect,useState} from "react";
import {ArrowRight,CheckCircle2,Clapperboard,ExternalLink,Loader2,Newspaper,Radar,RefreshCw,Send,ShieldCheck,X,MonitorPlay} from "lucide-react";
import {request} from "@/lib/studio-client";

type Lang="ru"|"uz"|"kk"|"en";
type Settings={enabled:boolean;consent:boolean;mode:"review"|"auto";languages:Lang[];channels:("telegram"|"youtube")[];youtubeLanguages:Lang[];maxPerDay:number;everyMinutes:number;model:"deepseek-flash"|"deepseek-v4-pro"};
type Story={key:string;title:string;sources:string[];articles:number;newest:string;taken:boolean;urls:{source:string;url:string}[]};
type Target={channel:"telegram"|"youtube";status:string;url?:string;error?:string};
type Item={id:string;story_key:string;language:string;project_id:string|null;status:string;media_id:string|null;error:string|null;created_at:string;result:Target[]|null;document:{storyTitle:string;headline:string;caption:string;sources:string[]}};
type State={settings:Settings;stories:Story[];items:Item[];channels:{telegram:{name:string;bot:string}|null;youtube:{name:string}|null;youtubeAvailable:boolean};deepseekConfigured:boolean;lastCollected:string|null;runnerSeen:string|null;today:number};

const LANGS:{id:Lang;name:string}[]=[{id:"ru",name:"Русский"},{id:"uz",name:"Oʻzbekcha"},{id:"kk",name:"Қазақша"},{id:"en",name:"English"}];
const STATUS:Record<string,string>={scripting:"Пишется сценарий",rendering:"Монтаж",review:"Ждёт проверки",publishing:"Публикуется",published:"Опубликовано",rejected:"Отклонено",failed:"Ошибка",skipped:"Пропущено фильтром",unconfirmed:"Не подтверждено",drafted:"Сценарии готовы"};
const ago=(iso:string|null)=>{if(!iso)return "никогда";const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?"только что":m<60?`${m} мин назад`:`${Math.round(m/60)} ч назад`};

export default function NewsRadar({onOpenProject,onSettings,onError,notify}:{onOpenProject:(id:string)=>void;onSettings:()=>void;onError:(e:unknown)=>unknown;notify:(s:string)=>void}){
 const [state,setState]=useState<State|null>(null),[draft,setDraft]=useState<Settings|null>(null),[busy,setBusy]=useState(""),[consent,setConsent]=useState(false),[tg,setTg]=useState({token:"",chat:""});
 const load=async()=>{try{const s:State=await request("/api/radar");setState(s);setDraft(d=>d??s.settings)}catch(e){onError(e)}};
 useEffect(()=>{void load();const yt=new URLSearchParams(location.search).get("youtube");if(yt){notify(yt.startsWith("ok:")?`YouTube подключён: ${yt.slice(3)}`:yt.slice(6));const u=new URL(location.href);u.searchParams.delete("youtube");history.replaceState({},"",u)}
  const t=setInterval(()=>{if(document.visibilityState==="visible")void load()},15000);return()=>clearInterval(t)},[]);
 const act=async(name:string,body:unknown,done?:string)=>{setBusy(name);try{const r=await request("/api/radar",body);if(done)notify(done);await load();return r}catch(e){onError(e)}finally{setBusy("")}};
 if(!state||!draft)return <div className="page-heading"><div><div className="eyebrow">НОВОСТНОЙ РАДАР</div><h1>Загрузка…</h1></div></div>;
 const s=draft,set=(p:Partial<Settings>)=>setDraft({...s,...p}),toggle=<T,>(a:T[],v:T)=>a.includes(v)?a.filter(x=>x!==v):[...a,v];
 const runnerActive=!!state.runnerSeen&&Date.now()-Date.parse(state.runnerSeen)<3*60000;
 const review=state.items.filter(i=>i.language!=="*"&&["review","publishing","published","rendering","failed"].includes(i.status));
 const drafts=state.items.filter(i=>i.language==="*").slice(0,8);

 return <><div className="page-heading"><div><div className="eyebrow">НОВОСТНОЙ РАДАР · АВТОПИЛОТ</div><h1>Новости находят вас сами</h1><p>Мировые издания → проверка по нескольким источникам → сценарии на четырёх языках → ролик → публикация.</p></div><button className="btn" disabled={!!busy} onClick={()=>void act("scan",{action:"scan"},"Ленты обновлены")}>{busy==="scan"?<Loader2 size={17} className="spin"/>:<RefreshCw size={17}/>}Обновить ленты</button></div>
  <div className="ai-pipeline"><span>01 · Радар<b>14 мировых изданий</b></span><ArrowRight/><span>02 · Проверка<b>≥ 2 независимых источника</b></span><ArrowRight/><span>03 · Сценарий<b>DeepSeek · RU / UZ / KK / EN</b></span><ArrowRight/><span>04 · Ролик и публикация<b>Runner · Telegram · YouTube</b></span></div>
  <div className="radar-status">
   <span className={runnerActive?"ok":"warn"}>{runnerActive?"Runner активен":"Runner не запущен — монтаж не выполняется"}</span>
   <span>Ленты: {ago(state.lastCollected)}</span><span>Историй за сутки: {state.today} / {s.maxPerDay}</span>
   <span className={state.deepseekConfigured?"ok":"warn"}>{state.deepseekConfigured?"DeepSeek подключён":<>DeepSeek не подключён · <button className="text-btn" onClick={onSettings}>подключить</button></>}</span>
  </div>

  <div className="radar-grid">
   <section className="panel"><div className="panel-heading"><h2><Radar size={17}/>Автопилот</h2></div><div className="radar-body">
    <div className="switch-row first"><div><b>Включить автопилот</b><small>Каждые {s.everyMinutes} мин берёт лучшую новую проверенную историю.</small></div><input className="switch" type="checkbox" checked={s.enabled} onChange={e=>set({enabled:e.target.checked})}/></div>
    <label className="field-label">Режим<div className="segmented small"><button className={s.mode==="review"?"selected":""} onClick={()=>set({mode:"review"})}>Проверка редактором</button><button className={s.mode==="auto"?"selected":""} onClick={()=>set({mode:"auto"})}>Публиковать сразу</button></div></label>
    <div className="field-label">Языки роликов<div className="radar-checks">{LANGS.map(l=><label key={l.id}><input type="checkbox" checked={s.languages.includes(l.id)} onChange={()=>set({languages:toggle(s.languages,l.id)})}/>{l.name}</label>)}</div></div>
    <div className="radar-row"><label className="field-label">Историй в сутки<input type="number" min={1} max={24} value={s.maxPerDay} onChange={e=>set({maxPerDay:Math.max(1,Math.min(24,Number(e.target.value)||1))})}/></label>
     <label className="field-label">Интервал, мин<input type="number" min={15} max={720} step={15} value={s.everyMinutes} onChange={e=>set({everyMinutes:Math.max(15,Math.min(720,Number(e.target.value)||60))})}/></label></div>
    <div className="field-label">Автопубликация<div className="radar-checks"><label><input type="checkbox" checked={s.channels.includes("telegram")} onChange={()=>set({channels:toggle(s.channels,"telegram")})}/>Telegram</label><label><input type="checkbox" checked={s.channels.includes("youtube")} onChange={()=>set({channels:toggle(s.channels,"youtube")})}/>YouTube</label></div>
     </div>
    <div className="field-label">Языки для YouTube<div className="radar-checks">{LANGS.map(l=><label key={l.id}><input type="checkbox" checked={s.youtubeLanguages.includes(l.id)} onChange={()=>set({youtubeLanguages:toggle(s.youtubeLanguages,l.id)})}/>{l.id.toUpperCase()}</label>)}</div><small className="hint">Квота YouTube API ≈ 6 загрузок в сутки — выберите 1–2 языка.</small></div>
    <label className="review-check"><input type="checkbox" checked={s.consent} onChange={e=>set({consent:e.target.checked})}/><span>Разрешаю автопилоту отправлять анонсы новостей в DeepSeek и оплачивать сценарии с моего баланса (около одного запроса на историю, не больше лимита в сутки).</span></label>
    <button className="btn primary" disabled={!!busy} onClick={()=>void act("settings",{action:"settings",settings:s},"Настройки автопилота сохранены")}>{busy==="settings"?<Loader2 size={17} className="spin"/>:<CheckCircle2 size={17}/>}Сохранить</button>
   </div></section>

   <section className="panel"><div className="panel-heading"><h2><Send size={17}/>Площадки автопубликации</h2></div><div className="radar-body">
    <div className="radar-channel"><div><b>Telegram-канал</b>{state.channels.telegram?<small>{state.channels.telegram.name} · {state.channels.telegram.bot}</small>:<small>Создайте бота у @BotFather и сделайте его администратором канала.</small>}</div>
     {state.channels.telegram&&<button className="text-btn danger" onClick={()=>void act("tg-off",{action:"disconnect",channel:"telegram"},"Telegram отключён")}>Отключить</button>}</div>
    {!state.channels.telegram&&<div className="radar-row"><input type="password" autoComplete="off" placeholder="Токен бота" value={tg.token} onChange={e=>setTg({...tg,token:e.target.value})}/><input placeholder="@канал" value={tg.chat} onChange={e=>setTg({...tg,chat:e.target.value})}/><button className="btn small" disabled={!!busy||!tg.token||!tg.chat} onClick={()=>void act("tg",{action:"telegram",...tg},"Telegram-канал подключён").then(r=>{if(r)setTg({token:"",chat:""})})}>Подключить</button></div>}
    <div className="radar-channel"><div><b>YouTube Shorts</b>{state.channels.youtube?<small>{state.channels.youtube.name}</small>:<small>{state.channels.youtubeAvailable?"Вход через Google, загрузка от имени вашего канала.":"Администратор сайта должен задать YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET."}</small>}</div>
     {state.channels.youtube?<button className="text-btn danger" onClick={()=>void act("yt-off",{action:"disconnect",channel:"youtube"},"YouTube отключён")}>Отключить</button>:state.channels.youtubeAvailable&&<a className="btn small" href="/api/youtube/connect"><MonitorPlay size={16}/>Подключить</a>}</div>
    <div className="ai-security"><ShieldCheck size={21}/><p>Токены хранятся зашифрованными на сервере и не возвращаются в браузер. Ролики помечаются как созданные с помощью AI.</p></div>
   </div></section>
  </div>

  <section className="panel"><div className="panel-heading"><h2><Newspaper size={17}/>Проверенные истории</h2><small>Только истории минимум из двух независимых изданий</small></div>
   <label className="review-check radar-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Разрешаю ручной запуск: один платный запрос DeepSeek на историю.</span></label>
   {state.stories.length?state.stories.map(st=><div className="radar-story" key={st.key}><div><b>{st.title}</b><small>{st.sources.length} изд.: {st.sources.join(", ")} · {ago(st.newest)}</small><div className="radar-links">{st.urls.map(u=><a key={u.url} href={u.url} target="_blank" rel="noreferrer">{u.source}<ExternalLink size={11}/></a>)}</div></div>
    {st.taken?<span className="radar-pill">В работе</span>:<button className="btn small" disabled={!!busy||!consent||!state.deepseekConfigured} onClick={()=>void act(`draft-${st.key}`,{action:"draft",storyKey:st.key,consent:true},"Сценарии созданы, ролики отправлены на монтаж")}>{busy===`draft-${st.key}`?<Loader2 size={15} className="spin"/>:<Clapperboard size={15}/>}Сделать выпуск</button>}</div>)
   :<p className="radar-empty">Историй пока нет. Нажмите «Обновить ленты».</p>}
  </section>

  <section className="panel"><div className="panel-heading"><h2><Clapperboard size={17}/>Ролики</h2><small>{s.mode==="auto"?"Публикуются сразу после монтажа":"Публикуются после вашей проверки"}</small></div>
   {review.length?<div className="radar-videos">{review.map(i=><ItemCard key={i.id} item={i} channels={state.channels} busy={busy} onOpen={()=>i.project_id&&onOpenProject(i.project_id)}
     onPublish={c=>void act(`pub-${i.id}`,{action:"publish",itemId:i.id,channels:c})} onReject={()=>void act(`rej-${i.id}`,{action:"reject",itemId:i.id},"Ролик отклонён")}/>)}</div>
   :<p className="radar-empty">Готовых роликов пока нет.</p>}
  </section>

  {drafts.length>0&&<section className="panel"><div className="panel-heading"><h2>Журнал автопилота</h2></div>{drafts.map(d=><div className="radar-story" key={d.id}><div><b>{d.document.storyTitle}</b><small>{STATUS[d.status]||d.status} · {ago(d.created_at)}{d.error?` · ${d.error}`:""}</small></div></div>)}</section>}
 </>;
}

function ItemCard({item:i,channels,busy,onOpen,onPublish,onReject}:{item:Item;channels:State["channels"];busy:string;onOpen:()=>void;onPublish:(c:("telegram"|"youtube")[])=>void;onReject:()=>void}){
 const done=(c:string)=>i.result?.find(r=>r.channel===c&&r.status==="published");
 const available=(["telegram","youtube"] as const).filter(c=>channels[c]&&!done(c));
 const [pick,setPick]=useState<("telegram"|"youtube")[]>(available);
 return <div className="radar-video"><div className="radar-video-media">{i.media_id?<video src={`/api/media/${i.media_id}`} controls playsInline preload="metadata"/>:<div className="scene-placeholder"><Loader2 size={26} className={i.status==="rendering"?"spin":""}/><p>{STATUS[i.status]}</p></div>}</div>
  <div className="radar-video-body"><div className="radar-video-top"><span className="radar-pill">{i.language.toUpperCase()}</span><span className={`radar-pill ${i.status}`}>{STATUS[i.status]||i.status}</span></div>
   <b>{i.document.headline}</b><p>{i.document.caption}</p>{i.error&&<p className="field-error">{i.error}</p>}
   {i.result?.map(r=><p key={r.channel} className={r.status==="published"?"radar-ok":"field-error"}>{r.channel==="telegram"?"Telegram":"YouTube"}: {r.url?<a href={r.url.startsWith("http")?r.url:undefined} target="_blank" rel="noreferrer">{r.url}</a>:r.error}</p>)}
   {["review","published"].includes(i.status)&&i.media_id&&<div className="radar-actions">{available.length>0&&<>{available.map(c=><label key={c} className="inline-check"><input type="checkbox" checked={pick.includes(c)} onChange={()=>setPick(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])}/>{c==="telegram"?"Telegram":"YouTube"}</label>)}
    <button className="btn primary small" disabled={!!busy||!pick.length} onClick={()=>onPublish(pick)}>{busy===`pub-${i.id}`?<Loader2 size={15} className="spin"/>:<Send size={15}/>}Опубликовать</button></>}
    {i.status==="review"&&<button className="btn small" disabled={!!busy} onClick={onReject}><X size={15}/>Отклонить</button>}
    {i.project_id&&<button className="text-btn" onClick={onOpen}>Открыть в студии · AI-ведущий<ArrowRight size={14}/></button>}</div>}
  </div></div>;
}
