import type { Job } from 'bullmq';
import { registerWorker } from '../queues/index.js';
import { publishCarousel } from '../services/meta.js';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

interface PublishJobData {
  publishingJobId: number;
}

async function processPublishJob(job: Job<PublishJobData>): Promise<void> {
  const { publishingJobId } = job.data;

  const pubJob = db
    .select()
    .from(schema.publishingJobs)
    .where(eq(schema.publishingJobs.id, publishingJobId))
    .get();

  if (!pubJob) throw new Error(`Publishing job ${publishingJobId} not found`);

  // Get routing decision → destination + post
  const routingDecision = db
    .select()
    .from(schema.routingDecisions)
    .where(eq(schema.routingDecisions.id, pubJob.routing_decision_id))
    .get();

  if (!routingDecision) throw new Error(`Routing decision ${pubJob.routing_decision_id} not found`);

  const destination = db
    .select()
    .from(schema.destinationAccounts)
    .where(eq(schema.destinationAccounts.id, routingDecision.destination_id))
    .get();

  if (!destination) throw new Error(`Destination ${routingDecision.destination_id} not found`);

  const post = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, routingDecision.post_id))
    .get();

  if (!post) throw new Error(`Post ${routingDecision.post_id} not found`);

  // Check auto-publish — if disabled, set to awaiting_approval
  if (!destination.auto_publish) {
    db.update(schema.publishingJobs)
      .set({ status: 'awaiting_approval' })
      .where(eq(schema.publishingJobs.id, publishingJobId))
      .run();
    console.log(`[publish] Job ${publishingJobId} awaiting manual approval for @${destination.ig_handle}`);
    return;
  }

  // Get translation for caption
  const translation = db
    .select()
    .from(schema.translations)
    .where(eq(schema.translations.post_id, post.id))
    .get();

  if (!translation || !translation.translated_slides) {
    throw new Error(`No translation found for post ${post.id}`);
  }

  // Build caption from translated slides
  const slides: string[] = JSON.parse(translation.translated_slides);
  const caption = slides.join('\n\n');

  // Get slide image paths — content slides (no destination) + CTA for this destination
  const contentSlides = db
    .select()
    .from(schema.carouselSlides)
    .where(
      and(
        eq(schema.carouselSlides.translation_id, translation.id),
        eq(schema.carouselSlides.status, 'completed')
      )
    )
    .all()
    .filter((s) => s.destination_id === null)
    .sort((a, b) => a.slide_number - b.slide_number);

  const ctaSlide = db
    .select()
    .from(schema.carouselSlides)
    .where(
      and(
        eq(schema.carouselSlides.translation_id, translation.id),
        eq(schema.carouselSlides.destination_id, destination.id),
        eq(schema.carouselSlides.status, 'completed')
      )
    )
    .all()
    .pop();

  // Build image URLs — these must be publicly accessible
  const baseUrl = getPublicBaseUrl();
  const imageUrls = contentSlides.map((s) => `${baseUrl}${s.image_path}`);
  if (ctaSlide?.image_path) {
    imageUrls.push(`${baseUrl}${ctaSlide.image_path}`);
  }

  if (imageUrls.length < 2) {
    throw new Error(`Not enough images for carousel (need 2+, have ${imageUrls.length})`);
  }

  // Cap at 10 images
  const finalUrls = imageUrls.slice(0, 10);

  try {
    db.update(schema.publishingJobs)
      .set({ status: 'creating_containers', attempts: pubJob.attempts + 1 })
      .where(eq(schema.publishingJobs.id, publishingJobId))
      .run();

    logActivity('publish_started', `Publishing ${post.shortcode} to @${destination.ig_handle}`, {
      entity_type: 'publishing_job',
      entity_id: publishingJobId,
    });

    const result = await publishCarousel(
      destination.ig_user_id,
      destination.access_token,
      finalUrls,
      caption
    );

    db.update(schema.publishingJobs)
      .set({
        status: 'published',
        child_container_ids: JSON.stringify(result.childContainerIds),
        parent_container_id: result.parentContainerId,
        published_media_id: result.publishedMediaId,
        updated_at: new Date().toISOString(),
      })
      .where(eq(schema.publishingJobs.id, publishingJobId))
      .run();

    // Update routing decision status
    db.update(schema.routingDecisions)
      .set({ status: 'published' })
      .where(eq(schema.routingDecisions.id, routingDecision.id))
      .run();

    logActivity('publish_success', `Published ${post.shortcode} to @${destination.ig_handle} (media: ${result.publishedMediaId})`, {
      entity_type: 'publishing_job',
      entity_id: publishingJobId,
      metadata: { published_media_id: result.publishedMediaId },
    });

    console.log(`[publish] ${post.shortcode} → @${destination.ig_handle}: published as ${result.publishedMediaId}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';

    db.update(schema.publishingJobs)
      .set({
        status: 'failed',
        error_log: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .where(eq(schema.publishingJobs.id, publishingJobId))
      .run();

    logActivity('publish_failed', `Publishing ${post.shortcode} to @${destination.ig_handle} failed: ${errorMsg}`, {
      entity_type: 'publishing_job',
      entity_id: publishingJobId,
    });

    throw err;
  }
}

function getPublicBaseUrl(): string {
  const setting = db.select().from(schema.settings).where(eq(schema.settings.key, 'public_base_url')).get();
  if (setting) return setting.value;
  // Fallback to localhost (won't work with Meta API in production)
  return `http://localhost:${process.env.PORT || 3000}`;
}

registerWorker<PublishJobData>('publish', processPublishJob, 2);

export { processPublishJob };
