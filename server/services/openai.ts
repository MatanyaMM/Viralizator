import OpenAI from 'openai';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type { TopicRoutingResult, TranslationResult } from '../../shared/types.js';

function getClient(): OpenAI {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    db.select().from(schema.settings).where(eq(schema.settings.key, 'openai_api_key')).get()?.value;
  if (!apiKey) throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY env var or "openai_api_key" in settings.');
  return new OpenAI({ apiKey });
}

// ── Topic Routing ──

export async function classifyTopics(
  caption: string,
  destinations: { id: number; topic_description: string }[]
): Promise<TopicRoutingResult> {
  const client = getClient();

  const destinationsList = destinations
    .map((d) => `- ID ${d.id}: ${d.topic_description}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a content classifier. Given an Instagram post caption, determine which destination accounts (by topic) are relevant matches.

Score each destination 0-100 based on relevance. Only include destinations with score >= 50.

Available destinations:
${destinationsList}

Respond in JSON format matching this schema:
{
  "matches": [
    { "destination_id": <number>, "score": <number 0-100>, "reason": "<brief explanation>" }
  ]
}`,
      },
      {
        role: 'user',
        content: `Instagram post caption:\n\n${caption}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from GPT-4o topic classification');

  return JSON.parse(content) as TopicRoutingResult;
}

// ── Hebrew Translation ──

export async function translateToHebrew(
  caption: string,
  retryFeedback?: string
): Promise<TranslationResult> {
  const client = getClient();

  let systemPrompt = `You are an expert translator specializing in modern Israeli Hebrew. Your task is to translate Instagram post captions into native Israeli Hebrew — using modern slang, cultural adaptation, and marketing energy.

Rules:
- Split the caption into punchy slide texts for a carousel post
- Each slide should be 5-15 words in Hebrew
- Use natural Israeli Hebrew (not formal/biblical)
- Adapt cultural references for Israeli audience
- Keep marketing energy and engagement hooks
- Include relevant emojis where appropriate
- Aim for 3-8 slides depending on content length

After translating, self-score the quality 1-10 based on:
- Natural Israeli Hebrew flow (not "translatese")
- Cultural adaptation quality
- Marketing punch and engagement potential
- Appropriate slide count and text length

Respond in JSON format:
{
  "slides": ["slide 1 text in Hebrew", "slide 2 text in Hebrew", ...],
  "quality_score": <number 1-10>
}`;

  if (retryFeedback) {
    systemPrompt += `\n\nPrevious attempt was scored below threshold. Feedback: ${retryFeedback}. Please improve the translation quality.`;
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Translate this Instagram caption to Hebrew carousel slides:\n\n${caption}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from GPT-4o translation');

  return JSON.parse(content) as TranslationResult;
}
