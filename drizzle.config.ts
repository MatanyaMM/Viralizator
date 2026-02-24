import { defineConfig } from 'drizzle-kit';
import { mkdirSync } from 'fs';

// Ensure data directory exists before drizzle-kit tries to open the DB
mkdirSync('./data', { recursive: true });

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/viralizator.db',
  },
});
