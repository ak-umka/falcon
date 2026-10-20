import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const connections=sqliteTable("connections",{ownerId:text("owner_id").primaryKey(),ciphertext:text("ciphertext").notNull(),updatedAt:text("updated_at").notNull()});
export const aiConnections=sqliteTable("ai_connections",{ownerId:text("owner_id").primaryKey(),ciphertext:text("ciphertext").notNull(),updatedAt:text("updated_at").notNull()});
export const scriptJobs=sqliteTable("script_jobs",{
  id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),requestKey:text("request_key").notNull(),
  projectId:text("project_id").notNull(),status:text("status").notNull(),document:text("document").notNull(),
  result:text("result"),error:text("error"),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("script_request").on(t.ownerId,t.requestKey),uniqueIndex("one_active_script").on(t.ownerId).where(sql`${t.status}='generating'`)]);
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), title: text("title").notNull(), document: text("document").notNull(),
  updatedAt: text("updated_at").notNull(), archived: integer("archived").notNull().default(0),
}, t => [index("projects_owner").on(t.ownerId)]);
export const media = sqliteTable("media", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), key: text("key").notNull(), kind: text("kind").notNull(), mime: text("mime").notNull(),
  filename: text("filename").notNull(), bytes: integer("bytes").notNull(), createdAt: text("created_at").notNull(),
});
export const avatars = sqliteTable("avatars", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(), photoId: text("photo_id").notNull(),
  consentAt: text("consent_at").notNull(), providerId: text("provider_id"), createdAt: text("created_at").notNull(),
});
export const backgrounds = sqliteTable("backgrounds", {
  id:text("id").primaryKey(), ownerId:text("owner_id").notNull(), requestKey:text("request_key").notNull(),
  name:text("name").notNull(), kind:text("kind").notNull(), avatarId:text("avatar_id"), photoId:text("photo_id"),
  status:text("status").notNull(), providerId:text("provider_id"), document:text("document").notNull(), error:text("error"),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
},t=>[index("backgrounds_owner").on(t.ownerId),uniqueIndex("background_request").on(t.ownerId,t.requestKey),uniqueIndex("one_active_background").on(t.ownerId).where(sql`${t.status} IN ('preparing','submitting','processing','unconfirmed')`)]);
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), projectId: text("project_id").notNull(), requestKey: text("request_key").notNull(),
  status: text("status").notNull(), providerId: text("provider_id"), document: text("document").notNull(), result: text("result"), error: text("error"), createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("render_request").on(t.ownerId, t.requestKey),uniqueIndex("one_active_render").on(t.ownerId,t.projectId).where(sql`${t.status} IN ('submitting','pending','processing','unconfirmed')`)]);
export const publications = sqliteTable("publications", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), projectId: text("project_id").notNull(), requestKey: text("request_key").notNull(),
  status: text("status").notNull(), payload: text("payload").notNull(), externalId: integer("external_id"), mediaFileId: integer("media_file_id"),
  result: text("result"), error: text("error"), createdAt: text("created_at").notNull(),
}, t => [uniqueIndex("publication_request").on(t.ownerId, t.requestKey)]);

export const mediaConnections=sqliteTable("media_connections",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),provider:text("provider").notNull(),ciphertext:text("ciphertext").notNull(),metadata:text("metadata").notNull(),updatedAt:text("updated_at").notNull()
},t=>[uniqueIndex("media_connection_owner_provider").on(t.ownerId,t.provider)]);
export const mediaJobs=sqliteTable("media_jobs",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),projectId:text("project_id").notNull(),sceneId:text("scene_id").notNull(),requestKey:text("request_key").notNull(),provider:text("provider").notNull(),operation:text("operation").notNull(),status:text("status").notNull(),signature:text("signature").notNull(),document:text("document").notNull(),externalId:text("external_id"),result:text("result"),error:text("error"),createdAt:text("created_at").notNull()
},t=>[uniqueIndex("media_job_request").on(t.ownerId,t.requestKey),index("media_job_project").on(t.ownerId,t.projectId),uniqueIndex("media_job_active").on(t.ownerId,t.projectId,t.sceneId).where(sql`${t.status} IN ('preparing','submitting','processing','unconfirmed')`)]);

export const productionRuns=sqliteTable("production_runs",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),projectId:text("project_id").notNull(),requestKey:text("request_key").notNull(),
 status:text("status").notNull(),document:text("document").notNull(),signature:text("signature").notNull(),result:text("result"),error:text("error"),
 leaseToken:text("lease_token"),leaseUntil:integer("lease_until").notNull().default(0),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},t=>[uniqueIndex("production_run_request").on(t.ownerId,t.requestKey),uniqueIndex("production_run_active").on(t.ownerId,t.projectId).where(sql`${t.status} IN ('queued','running','waiting')`)]);
export const workerHealth=sqliteTable("worker_health",{id:text("id").primaryKey(),updatedAt:text("updated_at").notNull()});

// Новостной радар и автопилот (v8)
export const radarArticles=sqliteTable("radar_articles",{
 id:text("id").primaryKey(),url:text("url").notNull(),source:text("source").notNull(),title:text("title").notNull(),summary:text("summary").notNull(),
 publishedAt:text("published_at").notNull(),fetchedAt:text("fetched_at").notNull()
},t=>[uniqueIndex("radar_article_url").on(t.url),index("radar_article_published").on(t.publishedAt)]);
export const autopilotSettings=sqliteTable("autopilot_settings",{ownerId:text("owner_id").primaryKey(),document:text("document").notNull(),updatedAt:text("updated_at").notNull()});
export const radarItems=sqliteTable("radar_items",{
 id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),storyKey:text("story_key").notNull(),language:text("language").notNull(),
 projectId:text("project_id"),status:text("status").notNull(),document:text("document").notNull(),mediaId:text("media_id"),
 result:text("result"),error:text("error"),leaseToken:text("lease_token"),leaseUntil:integer("lease_until").notNull().default(0),
 createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},t=>[uniqueIndex("radar_item_story").on(t.ownerId,t.storyKey,t.language),index("radar_item_owner").on(t.ownerId,t.createdAt),index("radar_item_status").on(t.status,t.leaseUntil)]);
