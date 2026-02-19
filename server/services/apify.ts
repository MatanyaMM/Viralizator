import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'apify~instagram-post-scraper';

interface ApifyPost {
  shortCode: string;
  caption?: string;
  likesCount: number;
  commentsCount: number;
  timestamp: string;
  displayUrl: string;
  ownerUsername: string;
  videoUrl?: string;
  type?: string;
}

function getToken(): string {
  const setting = db.select().from(schema.settings).where(eq(schema.settings.key, 'apify_token')).get();
  if (!setting) throw new Error('Apify API token not configured. Set "apify_token" in settings.');
  return setting.value;
}

export async function startScrapeRun(igHandle: string, resultsLimit = 50): Promise<string> {
  const token = getToken();

  const response = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${token}&waitForFinish=0`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      directUrls: [`https://www.instagram.com/${igHandle}/`],
      resultsLimit,
      resultsType: 'posts',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify run start failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { data: { id: string } };
  return data.data.id;
}

export async function pollRunStatus(runId: string): Promise<{ status: string; datasetId?: string }> {
  const token = getToken();

  const response = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
  if (!response.ok) throw new Error(`Apify poll failed (${response.status})`);

  const data = (await response.json()) as {
    data: { status: string; defaultDatasetId: string };
  };

  return {
    status: data.data.status,
    datasetId: data.data.defaultDatasetId,
  };
}

export async function fetchDatasetItems(datasetId: string): Promise<ApifyPost[]> {
  const token = getToken();

  const response = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}`);
  if (!response.ok) throw new Error(`Apify dataset fetch failed (${response.status})`);

  return (await response.json()) as ApifyPost[];
}

export async function scrapeAndStore(sourceChannelId: number): Promise<number> {
  const channel = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.id, sourceChannelId))
    .get();

  if (!channel) throw new Error(`Source channel ${sourceChannelId} not found`);

  logActivity('scrape_started', `Scraping @${channel.ig_handle}`, {
    entity_type: 'source_channel',
    entity_id: sourceChannelId,
  });

  // Start async run
  const runId = await startScrapeRun(channel.ig_handle);

  // Poll until done (max 5 minutes)
  const maxWait = 5 * 60 * 1000;
  const pollInterval = 10 * 1000;
  const startTime = Date.now();
  let datasetId: string | undefined;

  while (Date.now() - startTime < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const result = await pollRunStatus(runId);

    if (result.status === 'SUCCEEDED') {
      datasetId = result.datasetId;
      break;
    }
    if (result.status === 'FAILED' || result.status === 'ABORTED' || result.status === 'TIMED-OUT') {
      throw new Error(`Apify run ${runId} ended with status: ${result.status}`);
    }
  }

  if (!datasetId) throw new Error(`Apify run ${runId} timed out after ${maxWait / 1000}s`);

  // Fetch results
  const items = await fetchDatasetItems(datasetId);

  // Store all posts (dedup by shortcode)
  let newCount = 0;
  for (const item of items) {
    if (!item.shortCode) continue;

    // Check if already stored
    const existing = db
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.shortcode, item.shortCode))
      .get();

    if (existing) continue;

    db.insert(schema.posts)
      .values({
        source_channel_id: sourceChannelId,
        shortcode: item.shortCode,
        caption: item.caption || null,
        likes_count: item.likesCount ?? 0,
        comments_count: item.commentsCount ?? 0,
        ig_timestamp: item.timestamp || null,
        display_url: item.displayUrl || null,
      })
      .run();

    newCount++;
  }

  // Update source channel stats
  db.update(schema.sourceChannels)
    .set({
      last_scraped_at: new Date().toISOString(),
      total_posts_scraped: channel.total_posts_scraped + newCount,
    })
    .where(eq(schema.sourceChannels.id, sourceChannelId))
    .run();

  logActivity('scrape_completed', `Scraped @${channel.ig_handle}: ${newCount} new posts (${items.length} total)`, {
    entity_type: 'source_channel',
    entity_id: sourceChannelId,
    metadata: { new_posts: newCount, total_fetched: items.length, run_id: runId },
  });

  return newCount;
}
