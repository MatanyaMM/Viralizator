import { db, schema } from '../db/index.js';
import { sseBus } from '../services/sse-bus.js';
import type { ActivityEventType } from '../../shared/types.js';

export async function logActivity(
  event_type: ActivityEventType,
  message: string,
  opts?: {
    entity_type?: string;
    entity_id?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const entry = {
    event_type,
    message,
    entity_type: opts?.entity_type ?? null,
    entity_id: opts?.entity_id ?? null,
    metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
  };

  db.insert(schema.activityLog).values(entry).run();

  sseBus.broadcast({
    type: event_type,
    data: { message, ...opts },
    timestamp: new Date().toISOString(),
  });
}
