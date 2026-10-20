import { db, now } from "./server";
import { clusterStories, parseFeed, radarSources, storyKey, type RadarArticle, type RadarStory } from "./radar-core";

const COLLECT_EVERY_MS = 15 * 60_000, KEEP_DAYS = 7, WINDOW_HOURS = 36;
const UA = "Mozilla/5.0 (compatible; FalconNewsRadar/1.0)";

export async function lastCollected() {
  return (await db().prepare("SELECT updated_at FROM worker_health WHERE id='radar'").first<{ updated_at: string }>())?.updated_at || null;
}

/** Собирает все ленты. Без force — не чаще раза в 15 минут на всю студию. */
export async function collectArticles(force = false) {
  const last = await lastCollected();
  if (!force && last && Date.now() - Date.parse(last) < COLLECT_EVERY_MS) return null;
  await db().prepare("INSERT INTO worker_health(id,updated_at) VALUES('radar',?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at").bind(now()).run();
  const fetchedAt = now(), errors: string[] = [];
  const results = await Promise.all(radarSources.map(async s => {
    try {
      const r = await fetch(s.url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseFeed(await r.text(), s.name, fetchedAt);
    } catch (e) { errors.push(`${s.name}: ${e instanceof Error ? e.message : "ошибка"}`); return []; }
  }));
  const articles = results.flat();
  const statements = await Promise.all(articles.map(async a => db().prepare("INSERT OR IGNORE INTO radar_articles(id,url,source,title,summary,published_at,fetched_at) VALUES(?,?,?,?,?,?,?)")
    .bind(await storyKey(a.url), a.url, a.source, a.title, a.summary, a.publishedAt, fetchedAt)));
  for (let i = 0; i < statements.length; i += 50) await db().batch(statements.slice(i, i + 50));
  await db().prepare("DELETE FROM radar_articles WHERE published_at<?").bind(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString()).run();
  return { fetched: articles.length, errors };
}

export async function verifiedStories(hours = WINDOW_HOURS): Promise<RadarStory[]> {
  const rows = await db().prepare("SELECT id,url,source,title,summary,published_at AS publishedAt FROM radar_articles WHERE published_at>=? ORDER BY published_at")
    .bind(new Date(Date.now() - hours * 3_600_000).toISOString()).all<RadarArticle>();
  return clusterStories(rows.results);
}

/** Текст статьи для более точного пересказа; при ошибке — пусто, хватит анонсов. */
export async function articleText(url: string) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok || !(r.headers.get("content-type") || "").includes("html")) return "";
    const parts: string[] = []; let current = "";
    await new HTMLRewriter().on("article p, main p", {
      element(e) { if (current.trim()) parts.push(current.trim()); current = ""; e.onEndTag(() => { if (current.trim()) parts.push(current.trim()); current = ""; }); },
      text(t) { current += t.text; },
    }).transform(r).arrayBuffer();
    return parts.filter(p => p.length > 40).join("\n").slice(0, 6000);
  } catch { return ""; }
}
