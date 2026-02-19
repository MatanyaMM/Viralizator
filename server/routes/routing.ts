import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

const router = Router();

// List all routing decisions
router.get('/', (req, res) => {
  const { post_id, destination_id, status } = req.query as Record<string, string>;

  let decisions = db
    .select()
    .from(schema.routingDecisions)
    .orderBy(desc(schema.routingDecisions.created_at))
    .all();

  if (post_id) decisions = decisions.filter((d) => d.post_id === Number(post_id));
  if (destination_id) decisions = decisions.filter((d) => d.destination_id === Number(destination_id));
  if (status) decisions = decisions.filter((d) => d.status === status);

  res.json({ success: true, data: decisions });
});

// Get single routing decision with context
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const decision = db
    .select()
    .from(schema.routingDecisions)
    .where(eq(schema.routingDecisions.id, id))
    .get();

  if (!decision) {
    res.status(404).json({ success: false, error: 'Routing decision not found' });
    return;
  }

  const post = db.select().from(schema.posts).where(eq(schema.posts.id, decision.post_id)).get();
  const destination = db
    .select()
    .from(schema.destinationAccounts)
    .where(eq(schema.destinationAccounts.id, decision.destination_id))
    .get();

  res.json({ success: true, data: { ...decision, post, destination } });
});

// Override routing decision status
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: string };

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    res.status(400).json({ success: false, error: 'Status must be pending, approved, or rejected' });
    return;
  }

  const existing = db
    .select()
    .from(schema.routingDecisions)
    .where(eq(schema.routingDecisions.id, id))
    .get();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Routing decision not found' });
    return;
  }

  const result = db
    .update(schema.routingDecisions)
    .set({ status, overridden_by_user: true })
    .where(eq(schema.routingDecisions.id, id))
    .returning()
    .get();

  logActivity('post_routed', `Routing decision ${id} manually set to ${status}`, {
    entity_type: 'routing_decision',
    entity_id: id,
    metadata: { status, overridden: true },
  });

  res.json({ success: true, data: result });
});

// Manually create a routing decision
router.post('/', (req, res) => {
  const { post_id, destination_id } = req.body as { post_id: number; destination_id: number };

  if (!post_id || !destination_id) {
    res.status(400).json({ success: false, error: 'post_id and destination_id are required' });
    return;
  }

  const result = db
    .insert(schema.routingDecisions)
    .values({
      post_id,
      destination_id,
      match_score: null,
      match_reason: 'Manual assignment',
      status: 'approved',
      overridden_by_user: true,
    })
    .returning()
    .get();

  logActivity('post_routed', `Post ${post_id} manually routed to destination ${destination_id}`, {
    entity_type: 'routing_decision',
    entity_id: result.id,
  });

  res.status(201).json({ success: true, data: result });
});

export default router;
