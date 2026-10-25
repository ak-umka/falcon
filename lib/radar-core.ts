// Новостной радар: разбор RSS/Atom, склейка публикаций разных изданий в истории, проверка и рейтинг.
// Модуль без серверных зависимостей — используется в Worker и в тестах.
export type RadarSource = { name: string; url: string };
export type RadarArticle = { id: string; url: string; source: string; title: string; summary: string; publishedAt: string };
export type RadarStory = { key: string; articles: RadarArticle[]; sources: string[]; lead: RadarArticle; score: number; newest: string };

export const radarSources: RadarSource[] = [
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { name: "NPR", url: "https://feeds.npr.org/1004/rss.xml" },
  { name: "DW", url: "https://rss.dw.com/rdf/rss-en-world" },
  { name: "France 24", url: "https://www.france24.com/en/rss" },
  { name: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html" },
  { name: "Euronews", url: "https://www.euronews.com/rss" },
  { name: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { name: "CBS News", url: "https://www.cbsnews.com/latest/rss/world" },
  { name: "Sky News", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { name: "ABC News", url: "https://abcnews.go.com/abcnews/internationalheadlines" },
  { name: "The Independent", url: "https://www.independent.co.uk/news/world/rss" },
  { name: "LA Times", url: "https://www.latimes.com/world-nation/rss2.0.xml" },
];

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", mdash: "—", ndash: "–", hellip: "…" };
export function cleanText(raw: string) {
  const text = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);
  // Анонсы часто содержат экранированный HTML: снимаем теги ещё раз после декодирования.
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tag(block: string, names: string[]) {
  for (const n of names) { const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i")); if (m) return m[1]; }
  return "";
}
function isoDate(value: string) { const t = Date.parse(value.trim()); return Number.isFinite(t) ? new Date(t).toISOString() : null; }

export function parseFeed(xml: string, source: string, fetchedAt = new Date().toISOString()): Omit<RadarArticle, "id">[] {
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  const items: Omit<RadarArticle, "id">[] = [];
  for (const b of blocks) {
    const title = cleanText(tag(b, ["title"]));
    let url = cleanText(tag(b, ["link"]));
    if (!/^https?:\/\//.test(url)) url = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || cleanText(tag(b, ["guid", "id"]));
    if (!title || !/^https?:\/\//.test(url)) continue;
    const date = isoDate(cleanText(tag(b, ["pubDate", "published", "updated", "dc:date"])));
    items.push({ url, source, title: title.slice(0, 300), summary: cleanText(tag(b, ["description", "summary", "content"])).slice(0, 1500), publishedAt: date && date < fetchedAt ? date : fetchedAt });
  }
  return items;
}

const STOPWORDS = new Set(`a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those he she they them his her their we you i not no yes after before over under into about than then so up down out new says said say will would could can may has have had do does did more most also amid what who why how when where which while just us uk un world news live latest update updates report reports day week year two one three`.split(" "));
export function tokens(text: string) {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) || []).map(w => w.replace(/^['-]+|['-]+$/g, "")).filter(w => w.length > 2 && !STOPWORDS.has(w));
}
type Vector = Map<string, number>;
function vectors(docs: string[][]): Vector[] {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  return docs.map(d => {
    const tf = new Map<string, number>(); for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    const v: Vector = new Map(); let norm = 0;
    for (const [t, c] of tf) { const w = (c / d.length) * Math.log((docs.length + 1) / (df.get(t)! + 1)); v.set(t, w); norm += w * w; }
    norm = Math.sqrt(norm) || 1; for (const [t, w] of v) v.set(t, w / norm); return v;
  });
}
function cosine(a: Vector, b: Vector) { if (a.size > b.size) [a, b] = [b, a]; let s = 0; for (const [t, w] of a) s += w * (b.get(t) || 0); return s; }

// Live-блоги и справки «кто такой» плохо подходят как главный заголовок истории.
const NOT_HEADLINE = /as it happened|\blive\b|what we know|who is|what is|what's next|explained/i;

export async function storyKey(url: string) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(url)));
  return Array.from(hash.slice(0, 6), b => b.toString(16).padStart(2, "0")).join("");
}

/** Склеивает статьи разных изданий о одном событии. Верифицированы истории минимум из `minSources` изданий. */
export async function clusterStories(articles: RadarArticle[], { similarity = 0.28, minSources = 2, now = Date.now() } = {}): Promise<RadarStory[]> {
  const vecs = vectors(articles.map(a => [...tokens(a.title), ...tokens(a.title), ...tokens(a.summary)]));
  // Склейка по центру истории: статья присоединяется, только если похожа на историю в целом.
  // Попарная склейка «цепочкой» объединяла разные события (A≈B, B≈C ⇒ A, C вместе).
  const order = articles.map((_, i) => i).sort((x, y) => articles[x].publishedAt.localeCompare(articles[y].publishedAt));
  const clusters: { idx: number[]; sum: Vector; sources: Set<string> }[] = [];
  for (const i of order) {
    let best = -1, bestSim = similarity;
    clusters.forEach((c, k) => {
      let norm = 0; for (const w of c.sum.values()) norm += w * w;
      const sim = cosine(vecs[i], c.sum) / (Math.sqrt(norm) || 1);
      if (sim >= bestSim) { best = k; bestSim = sim; }
    });
    if (best < 0) { clusters.push({ idx: [i], sum: new Map(vecs[i]), sources: new Set([articles[i].source]) }); continue; }
    const c = clusters[best];
    c.idx.push(i); c.sources.add(articles[i].source);
    for (const [t, w] of vecs[i]) c.sum.set(t, (c.sum.get(t) || 0) + w);
  }
  const groups = clusters.map(c => c.idx);

  const stories: RadarStory[] = [];
  for (const idx of groups) {
    const members = idx.map(i => articles[i]), sources = [...new Set(members.map(a => a.source))].sort();
    if (sources.length < minSources) continue;
    const centrality = (i: number) => idx.reduce((s, j) => j === i ? s : s + cosine(vecs[i], vecs[j]), 0);
    const candidates = idx.filter(i => !NOT_HEADLINE.test(articles[i].title));
    const lead = articles[(candidates.length ? candidates : idx).reduce((best, i) => centrality(i) > centrality(best) ? i : best)];
    const first = members.reduce((a, b) => a.publishedAt < b.publishedAt || a.publishedAt === b.publishedAt && a.url < b.url ? a : b);
    const newest = members.reduce((a, b) => a.publishedAt > b.publishedAt ? a : b).publishedAt;
    const hours = Math.max((now - Date.parse(newest)) / 3_600_000, 0);
    // Больше независимых изданий и свежее — выше.
    stories.push({ key: await storyKey(first.url), articles: members, sources, lead, newest, score: sources.length * 10 / (1 + hours / 6) });
  }
  return stories.sort((a, b) => b.score - a.score);
}
