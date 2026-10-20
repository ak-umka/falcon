"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Film, ImagePlus, Maximize2, Monitor, Pause, Play, Plus, RotateCcw, Smartphone, Square, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { backgrounds, timecode } from "@/lib/news";
import type { Project } from "@/lib/news";
import { sceneLocation, type BackgroundItem } from "@/lib/backgrounds";
import { scriptScenes, scriptWords, wordAtCharacter } from "@/lib/rehearsal";

type Props = {
  project: Project;
  avatar?: { name: string; photo_id: string };
  videoSrc: string;
  videoChanged: boolean;
  onChange: (patch: Partial<Project>) => void;
  onPickAvatar: () => void;
  selectedBackground?: BackgroundItem;
  onOpenBackgrounds: () => void;
  prompterOpen: boolean;
  onPrompterChange: (open: boolean) => void;
};

export default function StudioPreview({ project, avatar, videoSrc, videoChanged, onChange, onPickAvatar, selectedBackground, onOpenBackgrounds, prompterOpen, onPrompterChange }: Props) {
  const words = useMemo(() => scriptWords(project.script), [project.script]);
  const scenes = useMemo(() => scriptScenes(project.script, words), [project.script, words]);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const positionRef = useRef(0);
  const [seekRevision, setSeekRevision] = useState(0);
  const [rate, setRate] = useState(1);
  const [narrate, setNarrate] = useState(true);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [mode, setMode] = useState<"rehearsal" | "video">("rehearsal");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeWordRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wordsPerSecond = 135 / 60 * rate;
  const duration = words.length / wordsPerSecond;
  const currentWord = Math.min(Math.floor(position), Math.max(0, words.length - 1));
  const currentScene = Math.max(0, scenes.findLastIndex(scene => scene.word <= currentWord));
  const cueStart = Math.floor(currentWord / 7) * 7;
  const cueWords = words.slice(cueStart, cueStart + 7);
  const progress = words.length ? position / words.length * 100 : 0;

  useEffect(() => { setSpeechAvailable("speechSynthesis" in window); }, []);
  useEffect(() => { setPlaying(false); positionRef.current = 0; setPosition(0); setMode("rehearsal"); }, [project.script, project.language]);
  useEffect(() => {
    if (prompterOpen) { videoRef.current?.pause(); dialogRef.current?.showModal(); }
    else dialogRef.current?.close();
  }, [prompterOpen]);
  useEffect(() => {
    if (prompterOpen) activeWordRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [currentWord, prompterOpen]);
  useEffect(() => {
    if (mode === "video") setPlaying(false);
  }, [mode]);

  // The clock is an estimate. Native word boundaries refine it when supported.
  // Cancelling each run makes pause, seek, edits and unmount stop the old voice.
  useEffect(() => {
    if (!playing || !words.length) return;
    let cancelled = false, frame = 0, lastPaint = 0;
    let anchor = { word: positionRef.current, time: performance.now() };
    const withVoice = narrate && speechAvailable;
    let utterance: SpeechSynthesisUtterance | undefined;
    const setHead = (value: number) => {
      positionRef.current = value;
      setPosition(value);
    };
    const finish = () => {
      if (cancelled) return;
      setHead(words.length);
      setPlaying(false);
    };
    if (withVoice) {
      const firstWord = Math.min(Math.floor(positionRef.current), words.length - 1);
      const startCharacter = words[firstWord].start;
      utterance = new SpeechSynthesisUtterance(project.script.slice(startCharacter));
      utterance.lang = { ru: "ru-RU", en: "en-US", uz: "uz-UZ" }[project.language];
      utterance.rate = rate;
      utterance.onstart = () => { if (!cancelled) anchor = { word: firstWord, time: performance.now() }; };
      utterance.onboundary = event => {
        if (cancelled || event.name !== "word") return;
        anchor = { word: wordAtCharacter(words, startCharacter + event.charIndex), time: performance.now() };
        setHead(anchor.word);
      };
      utterance.onend = finish;
      utterance.onerror = event => {
        if (cancelled || event.error === "canceled" || event.error === "interrupted") return;
        setVoiceNotice("Голос браузера недоступен. Репетиция продолжается без звука.");
        setNarrate(false);
      };
      speechSynthesis.cancel();
      speechSynthesis.speak(utterance);
    }
    const tick = (now: number) => {
      if (cancelled) return;
      const next = anchor.word + (now - anchor.time) / 1000 * wordsPerSecond;
      if (now - lastPaint >= 80) {
        setHead(Math.min(next, withVoice ? Math.max(0, words.length - .01) : words.length));
        lastPaint = now;
      }
      if (!withVoice && next >= words.length) { finish(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (utterance) { utterance.onend = null; utterance.onerror = null; utterance.onboundary = null; utterance.onstart = null; speechSynthesis.cancel(); }
    };
  }, [playing, seekRevision, rate, narrate, speechAvailable, words, wordsPerSecond, project.script, project.language]);

  const seek = (word: number) => {
    const next = Math.max(0, Math.min(word, words.length));
    positionRef.current = next; setPosition(next); setSeekRevision(value => value + 1);
    if (next === words.length) setPlaying(false);
  };
  const togglePlay = () => {
    setMode("rehearsal");
    if (positionRef.current >= words.length) seek(0);
    setPlaying(value => !value);
  };
  const closePrompter = () => { setPlaying(false); onPrompterChange(false); };
  const controls = (large = false) => <div className={`rehearsal-controls ${large ? "large" : ""}`}>
    <div className="transport-row">
      <button className="icon-btn" onClick={() => { setPlaying(false); seek(0); }} disabled={!words.length} aria-label="В начало сценария" title="В начало"><RotateCcw size={16}/></button>
      <button className="rehearsal-play" onClick={togglePlay} disabled={!words.length} aria-label={playing ? "Приостановить репетицию" : "Запустить репетицию"}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button>
      <div className="rehearsal-time"><b>{timecode(position / wordsPerSecond)}</b><span>/ ≈ {timecode(duration)}</span></div>
      <button className="icon-btn sound-button" onClick={() => { setNarrate(value => !value); setVoiceNotice(""); }} disabled={!speechAvailable} aria-label={narrate ? "Выключить голос браузера" : "Включить голос браузера"} aria-pressed={narrate && speechAvailable} title="Голос браузера">{narrate && speechAvailable ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
      <label className="rehearsal-speed"><span className="sr-only">Скорость репетиции</span><select value={rate} onChange={event => setRate(Number(event.target.value))}><option value={.8}>0.8×</option><option value={1}>1×</option><option value={1.2}>1.2×</option><option value={1.5}>1.5×</option></select></label>
    </div>
    <input className="rehearsal-scrubber" type="range" min={0} max={Math.max(1, words.length)} step={.1} value={position} disabled={!words.length} aria-label="Позиция в сценарии" aria-valuetext={`${timecode(position / wordsPerSecond)} из примерно ${timecode(duration)}`} onChange={event => seek(Number(event.target.value))} style={{ background: `linear-gradient(to right, #467cf4 ${progress}%, #e1e8f3 ${progress}%)` }}/>
    <div className="transport-caption"><span>{playing ? "Идёт репетиция" : words.length ? "Репетиция сценария" : "Добавьте текст для репетиции"}</span><span>{narrate && speechAvailable ? "Голос браузера" : "Без звука"}</span></div>
  </div>;

  return <section className="panel preview-panel interactive-preview" aria-label="Предпросмотр и репетиция">
    <div className="panel-heading"><h2><Monitor size={18}/>Предпросмотр</h2><button className="text-btn" onClick={() => onPrompterChange(true)} disabled={!words.length}><Maximize2 size={15}/>Телесуфлёр</button></div>
    <div className="preview-mode-tabs" role="group" aria-label="Режим предпросмотра"><button className={mode === "rehearsal" ? "selected" : ""} aria-pressed={mode === "rehearsal"} onClick={() => setMode("rehearsal")}><Play size={14}/>Репетиция</button><button className={mode === "video" ? "selected" : ""} aria-pressed={mode === "video"} disabled={!videoSrc} onClick={() => setMode("video")}><Film size={14}/>Готовое видео{videoSrc && <span className="ready-dot"/>}</button></div>
    {mode === "rehearsal" ? <>
      <div className="format-tabs" aria-label="Формат видео">{(["9:16", "16:9", "1:1"] as const).map((ratio, i) => { const Icon = [Smartphone, Monitor, Square][i]; return <button key={ratio} className={project.ratio === ratio ? "selected" : ""} aria-pressed={project.ratio === ratio} onClick={() => onChange({ ratio })}><Icon size={15}/>{ratio}</button>; })}<span>1080p</span></div>
      <div className={`preview-stage ratio-${project.ratio.replace(":", "-")}`}><div className="stage-guide"/><div className={`video-canvas ${project.background === "ivory" ? "light-canvas" : ""}`} style={{ aspectRatio: project.ratio.replace(":", "/"), background: backgrounds[project.background] }}>
        {selectedBackground?.photoId ? <><img src={`/api/media/${selectedBackground.photoId}`} alt={selectedBackground.name} className="avatar-image"/>{selectedBackground.kind==="uploaded"&&avatar&&<span className="reference-portrait"><img src={`/api/media/${avatar.photo_id}`} alt={avatar.name}/><small>Референс</small></span>}</> : avatar ? <img src={`/api/media/${avatar.photo_id}`} alt={avatar.name} className="avatar-image"/> : <button className="avatar-empty" onClick={onPickAvatar}><div className="avatar-rings"><UserRound size={74} strokeWidth={.8}/><span className="portrait-plus"><Plus size={15}/></span></div><strong>Лицо вашего<br/>следующего выпуска</strong><span>Добавить фотографию</span></button>}
        <div className="canvas-brand"><span className="tiny-square"/>FALCON NEWS</div>
        <span className={`rehearsal-indicator ${playing ? "is-playing" : ""}`}><i/>{playing ? "РЕПЕТИЦИЯ" : "ПРЕВЬЮ"}</span>
        <div className="canvas-bottom"><span className="canvas-tag">СТАТИЧНОЕ ФОТО</span>{avatar && <strong>{avatar.name}</strong>}{project.captions && cueWords.length > 0 && <span className="caption-preview">{cueWords.map((word, i) => <span key={word.start} className={cueStart + i === currentWord ? "spoken-word" : ""}>{word.text}{" "}</span>)}</span>}</div>
      </div></div>
      {controls()}
      {voiceNotice && <p className="rehearsal-notice" role="status">{voiceNotice}</p>}
      {scenes.length > 1 && <div className="scene-navigation"><button className="icon-btn" disabled={currentScene === 0} aria-label="Предыдущий фрагмент" onClick={() => seek(scenes[currentScene - 1].word)}><ChevronLeft size={16}/></button><div className="scene-chips" aria-label="Фрагменты сценария">{scenes.map((scene, index) => <button key={scene.start} className={index === currentScene ? "selected" : ""} aria-pressed={index === currentScene} title={scene.text} onClick={() => seek(scene.word)}>{String(index + 1).padStart(2, "0")}</button>)}</div><button className="icon-btn" disabled={currentScene >= scenes.length - 1} aria-label="Следующий фрагмент" onClick={() => seek(scenes[currentScene + 1].word)}><ChevronRight size={16}/></button></div>}
      <p className="preview-explainer">{selectedBackground?.kind==="uploaded"?"Предпросмотр фона и отдельного референса ведущего. Совмещение выполняется при создании видео.":"Фото остаётся статичным. Движения и речь появятся в готовом видео. Голос браузера — для репетиции."}</p>
      <div className="appearance"><div className="section-top compact"><h3>Фон ведущего</h3><span className="small-muted">Для генерации</span></div><div className="background-options">{([{ id: "original", title: "Фото" }, { id: "navy", title: "Midnight" }, { id: "ivory", title: "Ivory" }, { id: "slate", title: "Graphite" }] as const).map(background => <button key={background.id} className={project.background === background.id ? "selected" : ""} aria-pressed={project.background === background.id} onClick={() => onChange({ background: background.id })}><span style={{ background: background.id === "original" ? "linear-gradient(140deg,#8c9db2,#283a53)" : backgrounds[background.id] }}>{background.id === project.background && <Check size={16}/>}</span><small>{background.title}</small></button>)}</div><label className="switch-row"><span><b>Субтитры</b><small>Предпросмотр и готовый ролик</small></span><input type="checkbox" className="switch" checked={project.captions} onChange={event => onChange({ captions: event.target.checked })}/></label><button className="btn wide scene-picker-btn" onClick={onOpenBackgrounds}><ImagePlus size={16}/>{selectedBackground?.name||(project.background==="recipe"?sceneLocation(project.backgroundRecipe).name:"Города, природа, самолёты и яхты")}</button><p className="hint">{project.background==="recipe"?"Выбрано описание сцены. Изображение ещё не создано.":"Фон фотографии заменяется при генерации."}</p></div>
    </> : <div className="finished-preview"><video ref={videoRef} key={videoSrc} src={videoSrc} controls playsInline preload="metadata"/><div className={`video-version-note ${videoChanged ? "changed" : ""}`}><Film size={17}/><p>{videoChanged ? "Настройки выпуска изменены. Здесь предыдущая версия видео. Создайте новую версию, чтобы применить изменения." : "Готовый MP4. Просмотрите видео перед публикацией."}</p></div></div>}
    <dialog ref={dialogRef} className="prompter-dialog" onCancel={closePrompter} onClose={() => { if (prompterOpen) closePrompter(); }} aria-label="Телесуфлёр выпуска"><div className="prompter-header"><div><span className="eyebrow">FALCON · ТЕЛЕСУФЛЁР</span><h2>{project.title}</h2></div><button className="icon-btn" aria-label="Закрыть телесуфлёр" onClick={closePrompter}><X size={22}/></button></div><div className="prompter-body">{words.length ? scenes.map((scene, index) => { const nextStart = scenes[index + 1]?.word ?? words.length; return <p key={scene.start} className={index === currentScene ? "active" : ""}>{words.slice(scene.word, nextStart).map((word, offset) => { const active = scene.word + offset === currentWord; return <span key={word.start} ref={active ? activeWordRef : undefined} className={active ? "current" : ""}>{word.text}{" "}</span>; })}</p>; }) : <p>Добавьте текст выпуска в редакторе.</p>}</div><div className="prompter-footer">{controls(true)}<p>Репетиция текста · длительность приблизительная · голос браузера</p></div></dialog>
  </section>;
}
