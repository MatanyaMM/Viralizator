import type { Job } from 'bullmq';
import { registerWorker, addJob } from '../queues/index.js';
import { scorePost } from '../lib/viral-score.js';
import { classifyTopics } from '../services/openai.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

interface AnalyzeJobData {
  postId: number;
}

async function processAnalyzeJob(job: Job<AnalyzeJobData>): Promise<void> {
  const { postId } = job.data;

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);

  // Step 1: Score virality
  const result = scorePost(postId, post.source_channel_id, post.likes_count, post.comments_count);

  // Update post with scores
  db.update(schema.posts)
    .set({
      engagement_rate: result.engagement_rate,
      viral_score: result.viral_score,
      is_viral: result.is_viral,
    })
    .where(eq(schema.posts.id, postId))
    .run();

  console.log(`[analyze] Post ${post.shortcode}: ${result.reason}`);

  if (!result.is_viral) return;

  logActivity('post_viral', `Post ${post.shortcode} flagged as viral (${result.viral_score.toFixed(1)}x)`, {
    entity_type: 'post',
    entity_id: postId,
    metadata: { viral_score: result.viral_score, engagement_rate: result.engagement_rate },
  });

  // Step 2: Topic routing — only if viral
  if (!post.caption) {
    console.log(`[analyze] Post ${post.shortcode} has no caption — skipping topic routing`);
    return;
  }

  // Get all active destination accounts
  const destinations = db
    .select()
    .from(schema.destinationAccounts)
    .where(eq(schema.destinationAccounts.is_active, true))
    .all();

  if (destinations.length === 0) {
    console.log(`[analyze] No active destination accounts — skipping routing`);
    return;
  }

  const routingResult = await classifyTopics(
    post.caption,
    destinations.map((d) => ({ id: d.id, topic_description: d.topic_description }))
  );

  // Store routing decisions
  for (const match of routingResult.matches) {
    // Verify destination exists
    const dest = destinations.find((d) => d.id === match.destination_id);
    if (!dest) continue;

    db.insert(schema.routingDecisions)
      .values({
        post_id: postId,
        destination_id: match.destination_id,
        match_score: match.score,
        match_reason: match.reason,
        status: 'pending',
      })
      .run();

    logActivity('post_routed', `Post ${post.shortcode} matched to @${dest.ig_handle} (score: ${match.score})`, {
      entity_type: 'routing_decision',
      metadata: { post_id: postId, destination_id: match.destination_id, score: match.score },
    });
  }

  // If any matches, enqueue translation (once per post)
  if (routingResult.matches.length > 0) {
    // Check if translation already exists
    const existingTranslation = db
      .select()
      .from(schema.translations)
      .where(eq(schema.translations.post_id, postId))
      .get();

    if (!existingTranslation) {
      await addJob('translate', { postId });
    }
  }
}

registerWorker<AnalyzeJobData>('analyze', processAnalyzeJob, 5);

export { processAnalyzeJob };
