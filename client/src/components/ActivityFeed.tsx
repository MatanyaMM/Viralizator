import type { SSEEvent } from '../../../shared/types.js';
import { Activity } from 'lucide-react';

interface ActivityFeedProps {
  events: SSEEvent[];
  maxItems?: number;
}

const eventIcons: Record<string, string> = {
  post_scraped: '📥',
  post_viral: '🔥',
  post_routed: '🔀',
  translation_completed: '🔤',
  slide_generated: '🖼',
  publish_success: '✅',
  publish_failed: '❌',
  scrape_started: '🔍',
  scrape_completed: '✓',
  error: '⚠️',
};

export default function ActivityFeed({ events, maxItems = 20 }: ActivityFeedProps) {
  const displayed = events.slice(0, maxItems);

  return (
    <div className="card activity-feed">
      <div className="card-header">
        <Activity size={16} className="accent" />
        <h3>Live Activity</h3>
      </div>
      <div className="activity-list">
        {displayed.length === 0 ? (
          <p className="text-muted">No activity yet</p>
        ) : (
          displayed.map((event, i) => (
            <div key={i} className="activity-item">
              <span className="activity-icon">
                {eventIcons[event.type] || '•'}
              </span>
              <span className="activity-message">
                {(event.data as { message?: string }).message || event.type}
              </span>
              <span className="activity-time mono">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
