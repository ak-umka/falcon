import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, clusterStories, cleanText, radarSources } from '../lib/radar-core.ts';
const at='2026-10-20T12:00:00.000Z';
const rss=`<rss><channel><item><title><![CDATA[Alberta voters reject plan &amp; vote to stay]]></title><link>https://a.test/1</link><description>&lt;p&gt;Voters in Alberta rejected separation.&lt;/p&gt;</description><pubDate>Mon, 20 Oct 2026 10:00:00 GMT</pubDate></item><item><title>No link</title></item></channel></rss>`;
const atom=`<feed><entry><title>Atom story</title><link rel="alternate" href="https://b.test/2"/><summary>Short</summary><updated>2026-10-20T09:00:00Z</updated></entry></feed>`;
const rdf=`<rdf:RDF><item rdf:about="x"><title>DW story</title><link>https://c.test/3</link><dc:date>2026-10-20T08:00:00Z</dc:date></item></rdf:RDF>`;
const art=(id,source,title,summary,publishedAt='2026-10-20T10:00:00.000Z')=>({id,url:`https://${source.toLowerCase().replace(/ /g,'')}.test/${id}`,source,title,summary,publishedAt});
// Фон реального потока: без него TF-IDF на 2–3 статьях обнуляет общие слова.
const noise=['Central bank holds interest rates steady','Football club signs new striker','Wildfire spreads across Greek island','Tech company unveils new phone','Election campaign opens in Brazil','Scientists discover new deep sea species','Airline cancels flights after storm','Museum returns looted artefacts'].map((t,i)=>art(`n${i}`,`Outlet ${i}`,t,t));

test('RSS, Atom and RDF feeds parse into clean articles; items without links are skipped',()=>{
  const [a]=parseFeed(rss,'BBC',at);assert.equal(a.title,'Alberta voters reject plan & vote to stay');assert.equal(a.summary,'Voters in Alberta rejected separation.');assert.equal(a.publishedAt,'2026-10-20T10:00:00.000Z');assert.equal(parseFeed(rss,'BBC',at).length,1);
  assert.equal(parseFeed(atom,'NPR',at)[0].url,'https://b.test/2');assert.equal(parseFeed(rdf,'DW',at)[0].publishedAt,'2026-10-20T08:00:00.000Z');
});
test('future or missing dates are clamped to fetch time',()=>{const x=parseFeed('<item><title>T</title><link>https://d.test</link><pubDate>Fri, 01 Jan 2100 00:00:00 GMT</pubDate></item>','X',at);assert.equal(x[0].publishedAt,at)});
test('entities decode without leaving markup',()=>assert.equal(cleanText('&lt;b&gt;Tom&#39;s &#x2014; news&lt;/b&gt;'),"Tom's — news"));
test('only stories confirmed by different outlets are verified',async()=>{
  const stories=await clusterStories([
    art('1','BBC','Alberta voters reject independence referendum plan','Alberta province voters rejected a separation referendum from Canada'),
    art('2','DW','Canada: Alberta rejects independence referendum','Voters in Alberta province reject separation referendum from Canada'),
    art('3','BBC','Shark attack kills swimmer off South Africa','A swimmer was killed by a shark near Durban beach'),
    art('4','BBC','Alberta referendum: separatists vow to keep fighting','Alberta separation referendum rejected, separatists say Canada fight continues'),...noise,
  ],{now:Date.parse(at)});
  assert.equal(stories.length,1);assert.deepEqual(stories[0].sources,['BBC','DW']);assert.equal(stories[0].articles.length,3);
});
test('live blogs are not chosen as the story headline',async()=>{
  const [s]=await clusterStories([
    art('1','The Guardian','Alberta referendum result live: voters reject independence plan – as it happened','Alberta voters reject Canada separation referendum'),
    art('2','DW','Alberta voters reject Canada separation referendum','Alberta voters reject Canada separation referendum plan'),...noise,
  ],{now:Date.parse(at)});
  assert.equal(s.lead.source,'DW');
});
test('more outlets and fresher stories rank higher; keys are stable',async()=>{
  const a=[art('1','BBC','Volcano erupts in Iceland near town','Iceland volcano eruption lava town evacuated'),art('2','DW','Iceland volcano erupts, town evacuated','Volcano eruption Iceland lava'),art('3','NPR','Iceland volcano eruption forces evacuation','Lava volcano Iceland town')];
  const b=[art('4','BBC','Floods hit Spain coast','Spain floods coast rain','2026-10-19T10:00:00.000Z'),art('5','DW','Spain coast floods after rain','Floods Spain rain coast','2026-10-19T10:00:00.000Z')];
  const s=await clusterStories([...b,...a,...noise],{now:Date.parse(at)});assert.equal(s[0].sources.length,3);assert.ok(s[0].score>s[1].score);
  assert.equal((await clusterStories([...noise,...a,...b],{now:Date.parse(at)}))[0].key,s[0].key);
});
test('radar uses HTTPS sources only',()=>assert.ok(radarSources.every(s=>s.url.startsWith('https://'))));
