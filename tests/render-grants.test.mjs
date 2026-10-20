import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {withProductionOwner,productionOwner} from '../lib/provider-context.ts';
const mod=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
let source=ts.transpileModule(readFileSync(new URL('../lib/render-grants.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
source=source.replaceAll('"cloudflare:workers"',JSON.stringify(mod('export const env={PROVIDER_ENCRYPTION_KEY:"test-only-key",SITE_PUBLIC_URL:"https://example.com"};'))).replaceAll('"./server"',JSON.stringify(mod('export class AppError extends Error{};export async function ownMedia(id,owner){if(owner!=="owner")throw new AppError("not owned");return {id};}')));
const {renderURL,verifyRenderGrant}=await import(mod(source));
test('render grant verifies ownership at issue and rejects altered IDs, expiry and signature',async()=>{
 const id=crypto.randomUUID();await assert.rejects(renderURL('stranger',id));
 const u=new URL(await renderURL('owner',id)),expires=u.searchParams.get('expires'),signature=u.searchParams.get('signature');
 assert.ok(await verifyRenderGrant(id,expires,signature));
 assert.equal(await verifyRenderGrant(crypto.randomUUID(),expires,signature),false);
 assert.equal(await verifyRenderGrant(id,String(Number(expires)+1),signature),false);
 assert.equal(await verifyRenderGrant(id,expires,'0'.repeat(64)),false);
 assert.equal(await verifyRenderGrant(id,'1000000000',signature),false);
});
test('background provider owner scope stays isolated across concurrent tasks',async()=>{
 assert.equal(productionOwner(),undefined);
 const seen=await Promise.all(['alice','bob'].map(owner=>withProductionOwner(owner,async()=>{await new Promise(resolve=>setTimeout(resolve,5));return productionOwner()})));
 assert.deepEqual(seen,['alice','bob']);assert.equal(productionOwner(),undefined);
});
