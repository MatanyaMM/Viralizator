import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── Source Channels ──
export const sourceChannels = sqliteTable('source_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ig_handle: text('ig_handle').notNull().unique(),
  display_name: text('display_name'),
  scrape_frequency: text('scrape_frequency', { enum: ['30min', 'hourly', 'daily'] })
    .notNull()
    .default('hourly'),
  virality_threshold: real('virality_threshold'),
  last_scraped_at: text('last_scraped_at'),
  total_posts_scraped: integer('total_posts_scraped').notNull().default(0),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Destination Accounts ──
export const destinationAccounts = sqliteTable('destination_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ig_user_id: text('ig_user_id').notNull(),
  ig_handle: text('ig_handle').notNull(),
  access_token: text('access_token').notNull(),
  topic_description: text('topic_description').notNull(),
  brand_colors: text('brand_colors'), // JSON string
  logo_url: text('logo_url'),
  cta_template: text('cta_template'),
  auto_publish: integer('auto_publish', { mode: 'boolean' }).notNull().default(false),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Posts (ALL scraped posts) ──
export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source_channel_id: integer('source_channel_id')
    .notNull()
    .references(() => sourceChannels.id, { onDelete: 'cascade' }),
  shortcode: text('shortcode').notNull().unique(),
  caption: text('caption'),
  likes_count: integer('likes_count').notNull().default(0),
  comments_count: integer('comments_count').notNull().default(0),
  ig_timestamp: text('ig_timestamp'),
  display_url: text('display_url'),
  engagement_rate: real('engagement_rate'),
  is_viral: integer('is_viral', { mode: 'boolean' }).notNull().default(false),
  viral_score: real('viral_score'),
  scraped_at: text('scraped_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Routing Decisions (many-to-many: post → destination) ──
export const routingDecisions = sqliteTable('routing_decisions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  post_id: integer('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  destination_id: integer('destination_id')
    .notNull()
    .references(() => destinationAccounts.id, { onDelete: 'cascade' }),
  match_score: real('match_score'),
  match_reason: text('match_reason'),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'published'],
  })
    .notNull()
    .default('pending'),
  overridden_by_user: integer('overridden_by_user', { mode: 'boolean' })
    .notNull()
    .default(false),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Translations (one per post) ──
export const translations = sqliteTable('translations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  post_id: integer('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  original_caption: text('original_caption'),
  translated_slides: text('translated_slides'), // JSON array of strings
  quality_score: real('quality_score'),
  retry_count: integer('retry_count').notNull().default(0),
  status: text('status', {
    enum: ['pending', 'translating', 'completed', 'failed'],
  })
    .notNull()
    .default('pending'),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Carousel Slides (generated images) ──
export const carouselSlides = sqliteTable('carousel_slides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  translation_id: integer('translation_id')
    .notNull()
    .references(() => translations.id, { onDelete: 'cascade' }),
  destination_id: integer('destination_id').references(() => destinationAccounts.id, {
    onDelete: 'set null',
  }),
  slide_number: integer('slide_number').notNull(),
  image_path: text('image_path'),
  prompt_used: text('prompt_used'),
  status: text('status', {
    enum: ['pending', 'generating', 'completed', 'failed'],
  })
    .notNull()
    .default('pending'),
  attempts: integer('attempts').notNull().default(0),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Publishing Jobs (one per routing_decision) ──
export const publishingJobs = sqliteTable('publishing_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  routing_decision_id: integer('routing_decision_id')
    .notNull()
    .references(() => routingDecisions.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: [
      'queued',
      'creating_containers',
      'polling',
      'publishing',
      'published',
      'failed',
      'awaiting_approval',
    ],
  })
    .notNull()
    .default('queued'),
  child_container_ids: text('child_container_ids'), // JSON array
  parent_container_id: text('parent_container_id'),
  published_media_id: text('published_media_id'),
  error_log: text('error_log'),
  attempts: integer('attempts').notNull().default(0),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Activity Log (audit trail) ──
export const activityLog = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  event_type: text('event_type').notNull(),
  entity_type: text('entity_type'),
  entity_id: integer('entity_id'),
  message: text('message').notNull(),
  metadata: text('metadata'), // JSON
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ── Settings (key-value store) ──
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});
