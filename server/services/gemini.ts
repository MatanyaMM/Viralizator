import { GoogleGenAI } from '@google/genai';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

function getClient(): GoogleGenAI {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    db.select().from(schema.settings).where(eq(schema.settings.key, 'gemini_api_key')).get()?.value;
  if (!apiKey) throw new Error('Gemini API key not configured. Set GEMINI_API_KEY env var or "gemini_api_key" in settings.');
  return new GoogleGenAI({ apiKey });
}

interface SlideGenerationResult {
  imageBase64: string;
  mimeType: string;
}

/**
 * Generate a carousel slide image with Hebrew RTL text.
 */
export async function generateSlideImage(
  slideText: string,
  slideNumber: number,
  totalSlides: number,
  opts?: {
    brandColors?: string;
    isCTA?: boolean;
    ctaHandle?: string;
  }
): Promise<SlideGenerationResult> {
  const ai = getClient();

  let prompt: string;

  if (opts?.isCTA) {
    prompt = buildCTAPrompt(slideText, opts.ctaHandle || '', opts.brandColors);
  } else {
    prompt = buildSlidePrompt(slideText, slideNumber, totalSlides, opts?.brandColors);
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '4:5',
        imageSize: '2K',
        numberOfImages: 1,
      },
    } as Record<string, unknown>,
  });

  // Extract image from response
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidates in Gemini response');
  }

  const parts = candidates[0].content?.parts;
  if (!parts) throw new Error('No parts in Gemini response');

  for (const part of parts) {
    if (part.inlineData) {
      return {
        imageBase64: part.inlineData.data!,
        mimeType: part.inlineData.mimeType || 'image/png',
      };
    }
  }

  throw new Error('No image data found in Gemini response');
}

function buildSlidePrompt(text: string, slideNum: number, totalSlides: number, brandColors?: string): string {
  const colorInstructions = brandColors
    ? `Use these brand colors: ${brandColors}.`
    : 'Use a modern, clean color palette with dark background and bright accents.';

  return `Create a visually stunning Instagram carousel slide image (1080x1350 pixels, 4:5 portrait ratio).

CRITICAL TEXT REQUIREMENTS:
- Display this Hebrew text prominently in the center: "${text}"
- Hebrew text MUST be rendered RIGHT-TO-LEFT (RTL direction)
- Use a bold, modern sans-serif font
- Text must be large, clear, and easily readable
- Ensure proper Hebrew character rendering

DESIGN REQUIREMENTS:
- Slide ${slideNum} of ${totalSlides}
- ${colorInstructions}
- Modern, premium social media aesthetic
- Clean typography with good contrast
- Subtle background design that doesn't distract from text
- No watermarks or logos
- Professional Instagram carousel look`;
}

function buildCTAPrompt(text: string, handle: string, brandColors?: string): string {
  const colorInstructions = brandColors
    ? `Use these brand colors: ${brandColors}.`
    : 'Use warm amber/orange accents on dark background.';

  return `Create a compelling Call-to-Action slide for Instagram carousel (1080x1350 pixels, 4:5 portrait ratio).

CRITICAL TEXT REQUIREMENTS:
- Display this Hebrew CTA text: "${text}"
- Below the CTA, show the Instagram handle: @${handle}
- Hebrew text MUST be rendered RIGHT-TO-LEFT (RTL direction)
- Use bold, eye-catching typography
- Include a visual "follow" or "swipe" arrow indicator

DESIGN REQUIREMENTS:
- ${colorInstructions}
- Energetic, engaging call-to-action design
- Clear visual hierarchy: CTA text > handle > design elements
- Professional Instagram carousel look
- This is the LAST slide — it should feel like a conclusion`;
}

/**
 * Build a simplified prompt for retry attempts.
 * Attempt 2: remove detailed design instructions.
 * Attempt 3: minimal text-only prompt.
 */
export function buildRetryPrompt(text: string, attempt: number): string {
  if (attempt === 2) {
    return `Create an Instagram slide image (1080x1350, portrait). Display this Hebrew text (RTL) clearly in the center on a dark background: "${text}"`;
  }
  // Attempt 3: ultra-simple
  return `Image with Hebrew text: "${text}". Dark background, white text, 1080x1350 portrait format.`;
}
