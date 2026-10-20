import test from 'node:test';
import assert from 'node:assert/strict';
import {assetRequestSchema,connectionSchema} from '../lib/ai-catalog.ts';
import {briefSchema,defaultBrief,projectFromScript} from '../lib/script-generator.ts';
import {blankProject,projectSchema} from '../lib/news.ts';
import {responseText,openaiModelKind} from '../lib/openai-contract.ts';

test('OpenAI routes only supported modalities and rejects crossed models',()=>{
  assert.equal(connectionSchema.safeParse({action:'connect',provider:'openai',key:'test-key-not-real'}).success,true);
  const input={operation:'image',provider:'openai',model:'gpt-image-1',prompt:'Empty newsroom',ratio:'9:16'};
  assert.equal(assetRequestSchema.safeParse(input).success,true);
  for(const patch of [{operation:'video'},{operation:'audio',voiceId:'voice'},{model:'gpt-4.1'},{provider:'google'},{model:'../../secrets'}])assert.equal(assetRequestSchema.safeParse({...input,...patch}).success,false);
  assert.equal(openaiModelKind('gpt-4o-realtime-preview'),null);
});
test('legacy briefs default to DeepSeek; GPT briefs preserve provider on handoff',()=>{
  const {provider,...legacy}={...defaultBrief,task:'Подготовьте выпуск о студии'};
  assert.equal(briefSchema.parse(legacy).provider,'deepseek');
  const brief=briefSchema.parse({...legacy,provider:'openai',model:'gpt-4.1'});
  assert.equal(briefSchema.safeParse({...brief,model:'gpt-image-1'}).success,false);
  assert.equal(briefSchema.safeParse({...brief,provider:'deepseek'}).success,false);
  const result={title:'Выпуск',script:'Первый сюжет.\n\nВторой сюжет.',caption:'Описание',visualDirection:'Newsroom',checks:[]};
  const p=projectSchema.parse(projectFromScript(blankProject(),brief,result,crypto.randomUUID()));
  assert.equal(p.brief.provider,'openai');assert.equal(p.brief.model,'gpt-4.1');assert.equal(p.scenes.map(s=>s.text).join(' ').replace(/\s+/g,' '),result.script.replace(/\s+/g,' '));
});
test('Responses parser handles reasoning before message and refuses incomplete output',()=>{
  const output=[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'{"title":"Выпуск"}'}]}];
  assert.equal(responseText({status:'completed',output}),'{"title":"Выпуск"}');
  for(const status of ['incomplete','failed','in_progress'])assert.throws(()=>responseText({status,output}));
  assert.throws(()=>responseText({status:'completed',output:[]}));
  assert.throws(()=>responseText({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'Denied'}]}]}));
});
