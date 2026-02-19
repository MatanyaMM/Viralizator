import type { Job } from 'bullmq';
import { registerWorker, addJob } from '../queues/index.js';
import { generateSlideImage, buildRetryPrompt } from '../services/gemini.js';
import { saveSlideImage } from '../lib/image-storage.js';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

const MAX_ATTEMPTS = 3;

interface GenerateJobData {
  translationId: number;
  postId: number;
}

async function processGenerateJob(job: Job<GenerateJobData>): Promise<void> {
  const { translationId, postId } = job.data;

  const translation = db
    .select()
    .from(schema.translations)
    .where(eq(schema.translations.id, translationId))
    .get();

  if (!translation) throw new Error(`Translation ${translationId} not found`);
  if (!translation.translated_slides) throw new Error(`Translation ${translationId} has no slides`);

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);

  const slides: string[] = JSON.parse(translation.translated_slides);

  // Get all routing decisions for this post (for CTA slide per destination)
  const routingDecisions = db
    .select()
    .from(schema.routingDecisions)
    .where(eq(schema.routingDecisions.post_id, postId))
    .all()
    .filter((r) => r.status !== 'rejected');

  // Get destination accounts for CTA customization
  const destinations = new Map<number, typeof schema.destinationAccounts.$inferSelect>();
  for (const rd of routingDecisions) {
    const dest = db
      .select()
      .from(schema.destinationAccounts)
      .where(eq(schema.destinationAccounts.id, rd.destination_id))
      .get();
    if (dest) destinations.set(dest.id, dest);
  }

  // Generate content slides (shared across all destinations)
  const totalSlides = slides.length + 1; // +1 for CTA slide

  for (let i = 0; i < slides.length; i++) {
    const slideNum = i + 1;
    const slideText = slides[i];

    // Check if slide already exists and is completed
    const existingSlide = db
      .select()
      .from(schema.carouselSlides)
      .where(
        and(
          eq(schema.carouselSlides.translation_id, translationId),
          eq(schema.carouselSlides.slide_number, slideNum),
          eq(schema.carouselSlides.destination_id, 0) // 0 = shared content slide
        )
      )
      .get();

    if (existingSlide?.status === 'completed') continue;

    // Create or get slide record
    let slideRecord = existingSlide;
    if (!slideRecord) {
      slideRecord = db
        .insert(schema.carouselSlides)
        .values({
          translation_id: translationId,
          destination_id: null,
          slide_number: slideNum,
          status: 'generating',
          attempts: 0,
        })
        .returning()
        .get();
    }

    // Generate with retries
    let generated = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        db.update(schema.carouselSlides)
          .set({ status: 'generating', attempts: attempt })
          .where(eq(schema.carouselSlides.id, slideRecord.id))
          .run();

        const result = await generateSlideImage(slideText, slideNum, totalSlides);
        const imagePath = saveSlideImage(post.shortcode, slideNum, result.imageBase64);

        db.update(schema.carouselSlides)
          .set({
            image_path: imagePath,
            prompt_used: slideText,
            status: 'completed',
          })
          .where(eq(schema.carouselSlides.id, slideRecord.id))
          .run();

        logActivity('slide_generated', `Slide ${slideNum}/${totalSlides} generated for ${post.shortcode}`, {
          entity_type: 'carousel_slide',
          entity_id: slideRecord.id,
        });

        generated = true;
        break;
      } catch (err) {
        console.error(`[generate] Slide ${slideNum} attempt ${attempt} failed:`, err);
        if (attempt === MAX_ATTEMPTS) {
          db.update(schema.carouselSlides)
            .set({ status: 'failed' })
            .where(eq(schema.carouselSlides.id, slideRecord.id))
            .run();

          logActivity('slide_failed', `Slide ${slideNum} failed for ${post.shortcode} after ${MAX_ATTEMPTS} attempts`, {
            entity_type: 'carousel_slide',
            entity_id: slideRecord.id,
          });
        }
      }
    }
  }

  // Generate CTA slides — one per destination
  for (const [destId, dest] of destinations) {
    const ctaSlideNum = slides.length + 1;
    const ctaText = dest.cta_template || `עקבו אחרינו @${dest.ig_handle}`;

    const existingCTA = db
      .select()
      .from(schema.carouselSlides)
      .where(
        and(
          eq(schema.carouselSlides.translation_id, translationId),
          eq(schema.carouselSlides.slide_number, ctaSlideNum),
          eq(schema.carouselSlides.destination_id, destId)
        )
      )
      .get();

    if (existingCTA?.status === 'completed') continue;

    let ctaRecord = existingCTA;
    if (!ctaRecord) {
      ctaRecord = db
        .insert(schema.carouselSlides)
        .values({
          translation_id: translationId,
          destination_id: destId,
          slide_number: ctaSlideNum,
          status: 'generating',
          attempts: 0,
        })
        .returning()
        .get();
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        db.update(schema.carouselSlides)
          .set({ status: 'generating', attempts: attempt })
          .where(eq(schema.carouselSlides.id, ctaRecord.id))
          .run();

        const result = await generateSlideImage(ctaText, ctaSlideNum, ctaSlideNum, {
          isCTA: true,
          ctaHandle: dest.ig_handle,
          brandColors: dest.brand_colors || undefined,
        });

        const imagePath = saveSlideImage(post.shortcode, ctaSlideNum * 100 + destId, result.imageBase64);

        db.update(schema.carouselSlides)
          .set({
            image_path: imagePath,
            prompt_used: ctaText,
            status: 'completed',
          })
          .where(eq(schema.carouselSlides.id, ctaRecord.id))
          .run();

        logActivity('slide_generated', `CTA slide generated for ${post.shortcode} → @${dest.ig_handle}`, {
          entity_type: 'carousel_slide',
          entity_id: ctaRecord.id,
        });

        break;
      } catch (err) {
        console.error(`[generate] CTA slide for @${dest.ig_handle} attempt ${attempt} failed:`, err);
        if (attempt === MAX_ATTEMPTS) {
          db.update(schema.carouselSlides)
            .set({ status: 'failed' })
            .where(eq(schema.carouselSlides.id, ctaRecord.id))
            .run();
        }
      }
    }
  }

  // Check if all slides are generated — if so, enqueue publish jobs
  const allSlides = db
    .select()
    .from(schema.carouselSlides)
    .where(eq(schema.carouselSlides.translation_id, translationId))
    .all();

  const contentSlides = allSlides.filter((s) => s.destination_id === null);
  const allContentDone = contentSlides.every((s) => s.status === 'completed');

  if (allContentDone) {
    for (const rd of routingDecisions) {
      const ctaSlide = allSlides.find(
        (s) => s.destination_id === rd.destination_id && s.status === 'completed'
      );

      // Only enqueue publish if we have at least content slides (CTA is optional)
      if (contentSlides.length >= 1) {
        // Create publishing job
        const pubJob = db
          .insert(schema.publishingJobs)
          .values({
            routing_decision_id: rd.id,
            status: 'queued',
          })
          .returning()
          .get();

        await addJob('publish', { publishingJobId: pubJob.id });
      }
    }
  }
}

registerWorker<GenerateJobData>('generate', processGenerateJob, 2);

export { processGenerateJob };
