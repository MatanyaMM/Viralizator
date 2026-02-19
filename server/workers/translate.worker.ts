import type { Job } from 'bullmq';
import { registerWorker, addJob } from '../queues/index.js';
import { translateToHebrew } from '../services/openai.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

const QUALITY_THRESHOLD = 7;
const MAX_RETRIES = 3;

interface TranslateJobData {
  postId: number;
  retryCount?: number;
  feedback?: string;
}

async function processTranslateJob(job: Job<TranslateJobData>): Promise<void> {
  const { postId, retryCount = 0, feedback } = job.data;

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);
  if (!post.caption) throw new Error(`Post ${postId} has no caption to translate`);

  // Check/create translation record
  let translation = db
    .select()
    .from(schema.translations)
    .where(eq(schema.translations.post_id, postId))
    .get();

  if (!translation) {
    translation = db
      .insert(schema.translations)
      .values({
        post_id: postId,
        original_caption: post.caption,
        status: 'translating',
        retry_count: retryCount,
      })
      .returning()
      .get();
  } else {
    db.update(schema.translations)
      .set({ status: 'translating', retry_count: retryCount })
      .where(eq(schema.translations.id, translation.id))
      .run();
  }

  try {
    const result = await translateToHebrew(post.caption, feedback);

    db.update(schema.translations)
      .set({
        translated_slides: JSON.stringify(result.slides),
        quality_score: result.quality_score,
        status: result.quality_score >= QUALITY_THRESHOLD ? 'completed' : 'translating',
        retry_count: retryCount,
      })
      .where(eq(schema.translations.id, translation.id))
      .run();

    // Quality check — retry if below threshold
    if (result.quality_score < QUALITY_THRESHOLD && retryCount < MAX_RETRIES) {
      console.log(
        `[translate] Post ${post.shortcode} scored ${result.quality_score}/10 — retrying (${retryCount + 1}/${MAX_RETRIES})`
      );
      await addJob('translate', {
        postId,
        retryCount: retryCount + 1,
        feedback: `Previous score: ${result.quality_score}/10. Please improve naturalness and cultural adaptation.`,
      });
      return;
    }

    if (result.quality_score < QUALITY_THRESHOLD) {
      // Max retries reached — accept what we have
      db.update(schema.translations)
        .set({ status: 'completed' })
        .where(eq(schema.translations.id, translation.id))
        .run();
      console.log(
        `[translate] Post ${post.shortcode} accepted at ${result.quality_score}/10 after ${MAX_RETRIES} retries`
      );
    }

    logActivity('translation_completed', `Post ${post.shortcode} translated (${result.slides.length} slides, quality: ${result.quality_score}/10)`, {
      entity_type: 'translation',
      entity_id: translation.id,
      metadata: { slides_count: result.slides.length, quality_score: result.quality_score },
    });

    // Enqueue carousel generation
    await addJob('generate', { translationId: translation.id, postId });

    console.log(`[translate] Post ${post.shortcode}: ${result.slides.length} slides, quality ${result.quality_score}/10`);
  } catch (err) {
    db.update(schema.translations)
      .set({ status: 'failed' })
      .where(eq(schema.translations.id, translation.id))
      .run();

    logActivity('translation_failed', `Translation failed for post ${post.shortcode}: ${err instanceof Error ? err.message : 'Unknown error'}`, {
      entity_type: 'translation',
      entity_id: translation.id,
    });

    throw err;
  }
}

registerWorker<TranslateJobData>('translate', processTranslateJob, 3);

export { processTranslateJob };
