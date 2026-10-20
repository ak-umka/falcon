import test from "node:test";
import assert from "node:assert/strict";
import { blankProject,projectSchema } from "../lib/news.ts";
import { sceneSignature,videoSignature,splitScenes,assemblyPayload } from "../lib/production.ts";
import { assetRequestSchema,connectionSchema } from "../lib/ai-catalog.ts";
const scene=text=>({id:crypto.randomUUID(),text,visual:"",backgroundId:null});
const project=()=>({...blankProject(),avatarId:crypto.randomUUID(),voiceId:"real-voice",script:"Первый факт.\n\nВторой факт.",scenes:[scene("Первый факт."),scene("Второй факт.")]});
test("editing one scene invalidates only its render and final assembly",()=>{
  const p=project(),q=structuredClone(p);q.scenes[0].text="Исправленный факт.";q.script=q.scenes.map(s=>s.text).join("\n\n");
  assert.notEqual(sceneSignature(p,p.scenes[0]),sceneSignature(q,q.scenes[0]));assert.equal(sceneSignature(p,p.scenes[1]),sceneSignature(q,q.scenes[1]));assert.notEqual(videoSignature(p),videoSignature(q));
});
test("reordering scenes reuses video assets but invalidates final assembly",()=>{
  const p=project(),q={...p,scenes:[...p.scenes].reverse()};assert.notEqual(videoSignature(p),videoSignature(q));assert.equal(sceneSignature(p,p.scenes[0]),sceneSignature(q,q.scenes[1]));
});
test("caption change rebuilds assembly without paying for presenter again",()=>{
  const p=project(),q={...p,captions:!p.captions};assert.equal(sceneSignature(p,p.scenes[0]),sceneSignature(q,q.scenes[0]));assert.notEqual(videoSignature(p),videoSignature(q));
});
test("presenter and narration changes invalidate scene media",()=>{
  const p=project();for(const patch of [{voiceId:"new"},{avatarId:crypto.randomUUID()},{narration:"elevenlabs",narrationVoice:"new",narrationModel:"eleven_v3"},{ratio:"16:9"}])assert.notEqual(sceneSignature(p,p.scenes[0]),sceneSignature({...p,...patch},p.scenes[0]));
});
test("scene background override leaves other renders reusable",()=>{
  const p=project(),q=structuredClone(p);q.scenes[1].backgroundId=crypto.randomUUID();assert.equal(sceneSignature(p,p.scenes[0]),sceneSignature(q,q.scenes[0]));assert.notEqual(sceneSignature(p,p.scenes[1]),sceneSignature(q,q.scenes[1]));
});
test("imported MP4 provenance changes with script and audio, not social caption",()=>{
  const p=project();assert.notEqual(videoSignature(p),videoSignature({...p,script:"Updated"}));assert.notEqual(videoSignature(p),videoSignature({...p,audioId:crypto.randomUUID()}));assert.equal(videoSignature(p),videoSignature({...p,caption:"New social description"}));
});
test("assembly uses actual durations without clipping or gaps and captions above video",()=>{
  const r=assemblyPayload([{url:"https://example.com/a.mp4",duration:19.7},{url:"https://example.com/b.mp4",duration:40.3}],"9:16",true);
  const clips=r.timeline.tracks[1].clips;assert.equal(clips[0].start,0);assert.equal(clips[1].start,19.7);assert.equal(clips[1].length,40.3);assert.equal(r.timeline.tracks[0].clips[1].asset.src,"alias://scene-1");assert.equal(r.timeline.tracks[0].clips[1].start,19.7);assert.equal(r.output.aspectRatio,"9:16");
});
test("assembly rejects unknown durations and omits disabled captions",()=>{
  for(const d of [0,-1,NaN,Infinity])assert.throws(()=>assemblyPayload([{url:"https://example.com/a.mp4",duration:d}],"16:9",true));
  assert.equal(assemblyPayload([{url:"https://example.com/a.mp4",duration:5}],"16:9",false).timeline.tracks.length,1);
});
test("AI routing rejects arbitrary providers, path injection and incompatible tasks",()=>{
  assert.equal(connectionSchema.safeParse({action:"connect",provider:"http://localhost",key:"abcdefghijk"}).success,false);
  const video={operation:"video",provider:"google",prompt:"A calm river at sunrise",model:"veo-3.1-generate-preview",ratio:"9:16"};assert.ok(assetRequestSchema.safeParse(video).success);
  for(const patch of [{provider:"elevenlabs"},{model:"../../secrets"},{ratio:"1:1"},{operation:"audio"}])assert.equal(assetRequestSchema.safeParse({...video,...patch}).success,false);
  assert.ok(assetRequestSchema.safeParse({operation:"audio",provider:"elevenlabs",prompt:"Проверка озвучки",model:"eleven_multilingual_v2",voiceId:"voice123",ratio:"9:16"}).success);
});
test("legacy documents preserve content and gain safe production defaults",()=>{
  const p=blankProject();delete p.scenes;delete p.narration;delete p.narrationModel;delete p.narrationVoice;delete p.mediaSignature;const q=projectSchema.parse(p);assert.deepEqual(q.scenes,[]);assert.equal(q.narration,"heygen");assert.equal(q.mediaSignature,"");
});
test("splitting preserves all spoken words and bounds scene count",()=>{
  const script=Array.from({length:130},(_,i)=>`Факт ${i}: проверенные слова.`).join(" "),scenes=splitScenes(script);assert.ok(scenes.length>1&&scenes.length<=12);assert.equal(scenes.map(s=>s.text).join(" "),script);assert.deepEqual(splitScenes("  "),[]);
});
