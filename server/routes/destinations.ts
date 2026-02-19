import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';
import type { DestinationAccountInput } from '../../shared/types.js';

const router = Router();

// List all destination accounts
router.get('/', (_req, res) => {
  const accounts = db.select().from(schema.destinationAccounts).all();
  // Mask access tokens in list view
  const masked = accounts.map((a) => ({
    ...a,
    access_token: a.access_token.slice(0, 8) + '...',
  }));
  res.json({ success: true, data: masked });
});

// Get single destination account (full details)
router.get('/:id', (req, res) => {
  const account = db
    .select()
    .from(schema.destinationAccounts)
    .where(eq(schema.destinationAccounts.id, Number(req.params.id)))
    .get();
  if (!account) {
    res.status(404).json({ success: false, error: 'Destination account not found' });
    return;
  }
  res.json({ success: true, data: account });
});

// Create destination account
router.post('/', (req, res) => {
  const input = req.body as DestinationAccountInput;

  if (!input.ig_user_id || !input.ig_handle || !input.access_token || !input.topic_description) {
    res.status(400).json({
      success: false,
      error: 'ig_user_id, ig_handle, access_token, and topic_description are required',
    });
    return;
  }

  const result = db
    .insert(schema.destinationAccounts)
    .values({
      ig_user_id: input.ig_user_id,
      ig_handle: input.ig_handle.replace(/^@/, '').toLowerCase().trim(),
      access_token: input.access_token,
      topic_description: input.topic_description,
      brand_colors: input.brand_colors ?? null,
      logo_url: input.logo_url ?? null,
      cta_template: input.cta_template ?? null,
      auto_publish: input.auto_publish ?? false,
    })
    .returning()
    .get();

  logActivity('destination_added', `Destination account @${result.ig_handle} added`, {
    entity_type: 'destination_account',
    entity_id: result.id,
  });

  res.status(201).json({ success: true, data: { ...result, access_token: result.access_token.slice(0, 8) + '...' } });
});

// Update destination account
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const input = req.body as Partial<DestinationAccountInput>;

  const existing = db
    .select()
    .from(schema.destinationAccounts)
    .where(eq(schema.destinationAccounts.id, id))
    .get();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Destination account not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (input.ig_user_id !== undefined) updates.ig_user_id = input.ig_user_id;
  if (input.ig_handle !== undefined) updates.ig_handle = input.ig_handle.replace(/^@/, '').toLowerCase().trim();
  if (input.access_token !== undefined) updates.access_token = input.access_token;
  if (input.topic_description !== undefined) updates.topic_description = input.topic_description;
  if (input.brand_colors !== undefined) updates.brand_colors = input.brand_colors;
  if (input.logo_url !== undefined) updates.logo_url = input.logo_url;
  if (input.cta_template !== undefined) updates.cta_template = input.cta_template;
  if (input.auto_publish !== undefined) updates.auto_publish = input.auto_publish;

  const result = db
    .update(schema.destinationAccounts)
    .set(updates)
    .where(eq(schema.destinationAccounts.id, id))
    .returning()
    .get();

  res.json({ success: true, data: { ...result, access_token: result.access_token.slice(0, 8) + '...' } });
});

// Delete destination account
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db
    .select()
    .from(schema.destinationAccounts)
    .where(eq(schema.destinationAccounts.id, id))
    .get();

  if (!existing) {
    res.status(404).json({ success: false, error: 'Destination account not found' });
    return;
  }

  db.delete(schema.destinationAccounts).where(eq(schema.destinationAccounts.id, id)).run();

  logActivity('destination_removed', `Destination account @${existing.ig_handle} removed`, {
    entity_type: 'destination_account',
    entity_id: id,
  });

  res.json({ success: true, data: { id } });
});

export default router;
