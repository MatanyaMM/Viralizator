import type { Job } from 'bullmq';
import { registerWorker, addJob } from '../queues/index.js';
import { scrapeAndStore } from '../services/apify.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

interface ScrapeJobData {
  sourceChannelId: number;
}

async function processScrapeJob(job: Job<ScrapeJobData>): Promise<void> {
  const { sourceChannelId } = job.data;
  console.log(`[scrape] Processing scrape for source channel ${sourceChannelId}`);

  const newPosts = await scrapeAndStore(sourceChannelId);
  console.log(`[scrape] Stored ${newPosts} new posts for channel ${sourceChannelId}`);

  // Enqueue analysis for new (unscored) posts from this channel
  if (newPosts > 0) {
    const unanalyzed = db
      .select()
      .from(schema.posts)
      .where(eq(schema.posts.source_channel_id, sourceChannelId))
      .all()
      .filter((p) => p.engagement_rate === null);

    for (const post of unanalyzed) {
      await addJob('analyze', { postId: post.id });
    }
  }
}

// Register the worker
registerWorker<ScrapeJobData>('scrape', processScrapeJob, 3);

export { processScrapeJob };
