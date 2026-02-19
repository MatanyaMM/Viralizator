// ── Enums ──

export type ScrapeFrequency = '30min' | 'hourly' | 'daily';

export type PostStatus = 'scraped' | 'analyzing' | 'viral' | 'not_viral';

export type RoutingStatus = 'pending' | 'approved' | 'rejected' | 'published';

export type TranslationStatus = 'pending' | 'translating' | 'completed' | 'failed';

export type SlideStatus = 'pending' | 'generating' | 'completed' | 'failed';

export type PublishingStatus =
  | 'queued'
  | 'creating_containers'
  | 'polling'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'awaiting_approval';

export type ActivityEventType =
  | 'source_added'
  | 'source_removed'
  | 'destination_added'
  | 'destination_removed'
  | 'scrape_started'
  | 'scrape_completed'
  | 'post_scraped'
  | 'post_viral'
  | 'post_routed'
  | 'translation_completed'
  | 'translation_failed'
  | 'slide_generated'
  | 'slide_failed'
  | 'publish_started'
  | 'publish_success'
  | 'publish_failed'
  | 'setting_updated'
  | 'error';

// ── API Payloads ──

export interface SourceChannelInput {
  ig_handle: string;
  display_name?: string;
  scrape_frequency: ScrapeFrequency;
  virality_threshold?: number;
}

export interface DestinationAccountInput {
  ig_user_id: string;
  ig_handle: string;
  access_token: string;
  topic_description: string;
  brand_colors?: string;
  logo_url?: string;
  cta_template?: string;
  auto_publish: boolean;
}

export interface SettingInput {
  key: string;
  value: string;
}

// ── GPT-4o Structured Output Types ──

export interface TopicMatch {
  destination_id: number;
  score: number;
  reason: string;
}

export interface TopicRoutingResult {
  matches: TopicMatch[];
}

export interface TranslationResult {
  slides: string[];
  quality_score: number;
}

// ── SSE Event Types ──

export interface SSEEvent {
  type: ActivityEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// ── API Response Types ──

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}
