import { Router } from 'express';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { logActivity } from '../lib/activity.js';

const router = Router();

// Get all settings
router.get('/', (_req, res) => {
  const allSettings = db.select().from(schema.settings).all();
  const map: Record<string, string> = {};
  for (const s of allSettings) {
    map[s.key] = s.value;
  }
  res.json({ success: true, data: map });
});

// Get single setting
router.get('/:key', (req, res) => {
  const setting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, req.params.key))
    .get();
  if (!setting) {
    res.status(404).json({ success: false, error: 'Setting not found' });
    return;
  }
  res.json({ success: true, data: setting });
});

// Upsert setting
router.put('/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body as { value: string };

  if (value === undefined) {
    res.status(400).json({ success: false, error: 'value is required' });
    return;
  }

  db.insert(schema.settings)
    .values({ key, value, updated_at: new Date().toISOString() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updated_at: new Date().toISOString() },
    })
    .run();

  logActivity('setting_updated', `Setting "${key}" updated`, {
    entity_type: 'setting',
    metadata: { key, value },
  });

  res.json({ success: true, data: { key, value } });
});

// Bulk upsert settings
router.post('/bulk', (req, res) => {
  const entries = req.body as Record<string, string>;

  for (const [key, value] of Object.entries(entries)) {
    db.insert(schema.settings)
      .values({ key, value, updated_at: new Date().toISOString() })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value, updated_at: new Date().toISOString() },
      })
      .run();
  }

  res.json({ success: true, data: entries });
});

export default router;
