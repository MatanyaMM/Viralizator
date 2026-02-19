import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';
import type { SourceChannelInput } from '../../shared/types.js';

const router = Router();

// List all source channels
router.get('/', (_req, res) => {
  const channels = db.select().from(schema.sourceChannels).all();
  res.json({ success: true, data: channels });
});

// Get single source channel
router.get('/:id', (req, res) => {
  const channel = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.id, Number(req.params.id)))
    .get();
  if (!channel) {
    res.status(404).json({ success: false, error: 'Source channel not found' });
    return;
  }
  res.json({ success: true, data: channel });
});

// Create source channel
router.post('/', (req, res) => {
  const input = req.body as SourceChannelInput;

  if (!input.ig_handle) {
    res.status(400).json({ success: false, error: 'ig_handle is required' });
    return;
  }

  // Normalize handle: remove @ prefix if present
  const handle = input.ig_handle.replace(/^@/, '').toLowerCase().trim();

  try {
    const result = db
      .insert(schema.sourceChannels)
      .values({
        ig_handle: handle,
        display_name: input.display_name || handle,
        scrape_frequency: input.scrape_frequency || 'hourly',
        virality_threshold: input.virality_threshold ?? null,
      })
      .returning()
      .get();

    logActivity('source_added', `Source channel @${handle} added`, {
      entity_type: 'source_channel',
      entity_id: result.id,
    });

    res.status(201).json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ success: false, error: 'Source channel already exists' });
      return;
    }
    res.status(500).json({ success: false, error: message });
  }
});

// Update source channel
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const input = req.body as Partial<SourceChannelInput>;

  const existing = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.id, id))
    .get();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Source channel not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (input.ig_handle !== undefined) updates.ig_handle = input.ig_handle.replace(/^@/, '').toLowerCase().trim();
  if (input.display_name !== undefined) updates.display_name = input.display_name;
  if (input.scrape_frequency !== undefined) updates.scrape_frequency = input.scrape_frequency;
  if (input.virality_threshold !== undefined) updates.virality_threshold = input.virality_threshold;

  const result = db
    .update(schema.sourceChannels)
    .set(updates)
    .where(eq(schema.sourceChannels.id, id))
    .returning()
    .get();

  res.json({ success: true, data: result });
});

// Delete source channel
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.id, id))
    .get();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Source channel not found' });
    return;
  }

  db.delete(schema.sourceChannels).where(eq(schema.sourceChannels.id, id)).run();

  logActivity('source_removed', `Source channel @${existing.ig_handle} removed`, {
    entity_type: 'source_channel',
    entity_id: id,
  });

  res.json({ success: true, data: { id } });
});

export default router;
