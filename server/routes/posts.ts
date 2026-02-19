import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';

const router = Router();

// List posts with filtering
router.get('/', (req, res) => {
  const {
    source_id,
    destination_id,
    is_viral,
    page = '1',
    limit = '50',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const offset = (pageNum - 1) * limitNum;

  let query = db.select().from(schema.posts);

  const conditions = [];
  if (source_id) conditions.push(eq(schema.posts.source_channel_id, Number(source_id)));
  if (is_viral === 'true') conditions.push(eq(schema.posts.is_viral, true));
  if (is_viral === 'false') conditions.push(eq(schema.posts.is_viral, false));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const posts = query.orderBy(desc(schema.posts.created_at)).limit(limitNum).offset(offset).all();

  // Get total count
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.posts)
    .all();
  const total = countResult[0]?.count ?? 0;

  // If filtering by destination, join through routing_decisions
  if (destination_id) {
    const routedPosts = db
      .select({ post_id: schema.routingDecisions.post_id })
      .from(schema.routingDecisions)
      .where(eq(schema.routingDecisions.destination_id, Number(destination_id)))
      .all()
      .map((r) => r.post_id);

    const filtered = posts.filter((p) => routedPosts.includes(p.id));
    res.json({ success: true, data: filtered, total: filtered.length, page: pageNum, limit: limitNum });
    return;
  }

  res.json({ success: true, data: posts, total, page: pageNum, limit: limitNum });
});

// Get single post with related data
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  if (!post) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  // Get routing decisions
  const routing = db
    .select()
    .from(schema.routingDecisions)
    .where(eq(schema.routingDecisions.post_id, id))
    .all();

  // Get translation
  const translation = db
    .select()
    .from(schema.translations)
    .where(eq(schema.translations.post_id, id))
    .get();

  // Get slides
  let slides: unknown[] = [];
  if (translation) {
    slides = db
      .select()
      .from(schema.carouselSlides)
      .where(eq(schema.carouselSlides.translation_id, translation.id))
      .all();
  }

  res.json({
    success: true,
    data: {
      ...post,
      routing,
      translation,
      slides,
    },
  });
});

// Delete post
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.select().from(schema.posts).where(eq(schema.posts.id, id)).get();
  if (!existing) {
    res.status(404).json({ success: false, error: 'Post not found' });
    return;
  }

  db.delete(schema.posts).where(eq(schema.posts.id, id)).run();
  res.json({ success: true, data: { id } });
});

// Bulk delete posts
router.post('/bulk-delete', (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ success: false, error: 'ids array is required' });
    return;
  }

  for (const id of ids) {
    db.delete(schema.posts).where(eq(schema.posts.id, id)).run();
  }

  res.json({ success: true, data: { deleted: ids.length } });
});

export default router;
