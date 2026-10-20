import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,projectSchema} from '../lib/news.ts';
import {sceneSchema,sceneSignature,videoSignature,sameRenderedVersion,assemblyPayload} from '../lib/production.ts';
test('mixed scenes preserve order, mute original video and caption separate voice',()=>{
 const result=assemblyPayload([{url:'https://example.com/host.mp4',duration:20},{kind:'image',url:'https://example.com/photo.png',duration:10,audioUrl:'https://example.com/voice.mp3'},{kind:'video',url:'https://example.com/veo.mp4',duration:8,trim:2,mute:true}],'9:16',true);
 const [captions,visuals,audio]=result.timeline.tracks;
 assert.deepEqual(visuals.clips.map(c=>[c.asset.type,c.start,c.length]),[['video',0,20],['image',20,10],['video',30,8]]);
 assert.equal(visuals.clips[2].asset.trim,2);assert.equal(visuals.clips[2].asset.volume,0);
 assert.equal(audio.clips[0].start,20);assert.equal(captions.clips[1].asset.src,'alias://voice-1');assert.equal(captions.clips.length,2);
});
test('changing a cutaway invalidates montage without regenerating presenter',()=>{
 const host=sceneSchema.parse({id:crypto.randomUUID(),text:'Новости.'}),cut=sceneSchema.parse({id:crypto.randomUUID(),kind:'video',mediaId:crypto.randomUUID(),text:''});
 const p=projectSchema.parse({...blankProject(),scenes:[host,cut]});const next=structuredClone(p);next.scenes[1].trim=2;
 assert.equal(sceneSignature(p,host),sceneSignature(next,next.scenes[0]));assert.notEqual(videoSignature(p),videoSignature(next));
});
test('legacy rendered snapshots match defaults, but changed narration is rejected',()=>{
 const original=blankProject(),legacy=structuredClone(original);delete legacy.scenes;delete legacy.narration;delete legacy.narrationVoice;delete legacy.narrationModel;
 assert.ok(sameRenderedVersion(original,projectSchema.parse(legacy)));
 assert.equal(sameRenderedVersion({...original,script:'Исправленный текст'},original),false);
 assert.ok(sameRenderedVersion({...original,caption:'Другое описание поста'},original));
});
