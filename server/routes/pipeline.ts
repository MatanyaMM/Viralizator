import { Router } from 'express';
import { addJob } from '../queues/index.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Manually trigger scrape for a source channel
router.post('/scrape/:sourceId', async (req, res) => {
  const sourceId = Number(req.params.sourceId);

  const channel = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.id, sourceId))
    .get();

  if (!channel) {
    res.status(404).json({ success: false, error: 'Source channel not found' });
    return;
  }

  try {
    await addJob('scrape', { sourceChannelId: sourceId });
    res.json({ success: true, data: { message: `Scrape queued for @${channel.ig_handle}` } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Manually trigger analysis for a specific post
router.post('/analyze/:postId', async (req, res) => {
  const postId = Number(req.params.postId);

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  try {
    await addJob('analyze', { postId });
    res.json({ success: true, data: { message: `Analysis queued for post ${post.shortcode}` } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Retry publishing job
router.post('/retry-publish/:jobId', async (req, res) => {
  const jobId = Number(req.params.jobId);

  const job = db
    .select()
    .from(schema.publishingJobs)
    .where(eq(schema.publishingJobs.id, jobId))
    .get();

  if (!job) {
    res.status(404).json({ success: false, error: 'Publishing job not found' });
    return;
  }

  try {
    await addJob('publish', { publishingJobId: jobId });
    res.json({ success: true, data: { message: `Publish retry queued for job ${jobId}` } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Approve a publishing job that's awaiting manual approval
router.post('/approve-publish/:jobId', async (req, res) => {
  const jobId = Number(req.params.jobId);

  const job = db
    .select()
    .from(schema.publishingJobs)
    .where(eq(schema.publishingJobs.id, jobId))
    .get();

  if (!job) {
    res.status(404).json({ success: false, error: 'Publishing job not found' });
    return;
  }

  if (job.status !== 'awaiting_approval') {
    res.status(400).json({ success: false, error: `Job status is "${job.status}", not awaiting_approval` });
    return;
  }

  try {
    // Reset status to queued and re-add to queue
    // Temporarily set auto_publish on the destination to allow it through
    db.update(schema.publishingJobs)
      .set({ status: 'queued' })
      .where(eq(schema.publishingJobs.id, jobId))
      .run();

    await addJob('publish', { publishingJobId: jobId });
    res.json({ success: true, data: { message: `Publishing job ${jobId} approved and queued` } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// Trigger full pipeline: scrape all active sources
router.post('/scrape-all', async (_req, res) => {
  const sources = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.is_active, true))
    .all();

  if (sources.length === 0) {
    res.json({ success: true, data: { message: 'No active source channels' } });
    return;
  }

  try {
    for (const source of sources) {
      await addJob('scrape', { sourceChannelId: source.id });
    }
    res.json({ success: true, data: { message: `Scrape queued for ${sources.length} source(s)` } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
