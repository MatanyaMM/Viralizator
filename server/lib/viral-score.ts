import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const DEFAULT_THRESHOLD_MULTIPLIER = 3.0;
const BASELINE_MIN_POSTS = 10;

interface ViralResult {
  engagement_rate: number;
  viral_score: number;
  is_viral: boolean;
  reason: string;
}

/**
 * Calculate engagement rate for a post.
 * Uses likes + comments. If likes are hidden (likesCount === -1),
 * uses comments-only scoring.
 */
function calculateEngagementRate(likesCount: number, commentsCount: number): {
  rate: number;
  commentsOnly: boolean;
} {
  if (likesCount === -1) {
    // Hidden likes — use comments only
    return { rate: commentsCount, commentsOnly: true };
  }
  return { rate: likesCount + commentsCount, commentsOnly: false };
}

/**
 * Get the baseline engagement for a source channel based on historical posts.
 * Returns the average engagement rate from the last 100 posts.
 */
function getBaseline(sourceChannelId: number): {
  avgRate: number;
  commentsOnlyAvgRate: number;
  postCount: number;
} {
  const recentPosts = db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.source_channel_id, sourceChannelId))
    .all()
    .sort((a, b) => {
      const ta = a.ig_timestamp || a.created_at;
      const tb = b.ig_timestamp || b.created_at;
      return tb.localeCompare(ta);
    })
    .slice(0, 100);

  if (recentPosts.length === 0) {
    return { avgRate: 0, commentsOnlyAvgRate: 0, postCount: 0 };
  }

  let totalRate = 0;
  let totalCommentsOnly = 0;
  let countNormal = 0;
  let countCommentsOnly = 0;

  for (const post of recentPosts) {
    if (post.likes_count === -1) {
      totalCommentsOnly += post.comments_count;
      countCommentsOnly++;
    } else {
      totalRate += post.likes_count + post.comments_count;
      countNormal++;
    }
  }

  return {
    avgRate: countNormal > 0 ? totalRate / countNormal : 0,
    commentsOnlyAvgRate: countCommentsOnly > 0 ? totalCommentsOnly / countCommentsOnly : 0,
    postCount: recentPosts.length,
  };
}

/**
 * Get the virality threshold multiplier for a source channel.
 * Falls back to global setting, then to default.
 */
function getThreshold(sourceChannelId: number): number {
  // Check channel-specific threshold
  const channel = db
    .select()
    .from(schema.sourceChannels)
    .where(eq(schema.sourceChannels.id, sourceChannelId))
    .get();

  if (channel?.virality_threshold) {
    return channel.virality_threshold;
  }

  // Fall back to global setting
  const globalSetting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, 'global_virality_threshold'))
    .get();

  if (globalSetting) {
    return parseFloat(globalSetting.value) || DEFAULT_THRESHOLD_MULTIPLIER;
  }

  return DEFAULT_THRESHOLD_MULTIPLIER;
}

/**
 * Score a post for virality against its source channel's baseline.
 */
export function scorePost(
  postId: number,
  sourceChannelId: number,
  likesCount: number,
  commentsCount: number
): ViralResult {
  const baseline = getBaseline(sourceChannelId);
  const threshold = getThreshold(sourceChannelId);

  // Not enough data for baseline — store but don't flag
  if (baseline.postCount < BASELINE_MIN_POSTS) {
    const { rate } = calculateEngagementRate(likesCount, commentsCount);
    return {
      engagement_rate: rate,
      viral_score: 0,
      is_viral: false,
      reason: `Insufficient baseline data (${baseline.postCount}/${BASELINE_MIN_POSTS} posts)`,
    };
  }

  const { rate, commentsOnly } = calculateEngagementRate(likesCount, commentsCount);
  const baselineRate = commentsOnly ? baseline.commentsOnlyAvgRate : baseline.avgRate;

  if (baselineRate === 0) {
    return {
      engagement_rate: rate,
      viral_score: 0,
      is_viral: false,
      reason: 'Baseline rate is zero',
    };
  }

  // viral_score: how many times above baseline
  const viralScore = rate / baselineRate;
  const isViral = viralScore >= threshold;

  return {
    engagement_rate: rate,
    viral_score: viralScore,
    is_viral: isViral,
    reason: isViral
      ? `${viralScore.toFixed(1)}x above baseline (threshold: ${threshold}x)`
      : `${viralScore.toFixed(1)}x — below ${threshold}x threshold`,
  };
}
