import { mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';

const PUBLIC_DIR = resolve(process.cwd(), 'public/images/carousels');

/**
 * Save a base64-encoded PNG image to disk and return the public URL path.
 */
export function saveSlideImage(
  postShortcode: string,
  slideNumber: number,
  base64Data: string
): string {
  const dir = resolve(PUBLIC_DIR, postShortcode);
  mkdirSync(dir, { recursive: true });

  const filename = `slide_${slideNumber}.png`;
  const filePath = resolve(dir, filename);

  const buffer = Buffer.from(base64Data, 'base64');
  writeFileSync(filePath, buffer);

  // Return the public URL path (served by Express static middleware)
  return `/images/carousels/${postShortcode}/${filename}`;
}
