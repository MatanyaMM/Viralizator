import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import sourcesRouter from './routes/sources.js';
import destinationsRouter from './routes/destinations.js';
import postsRouter from './routes/posts.js';
import routingRouter from './routes/routing.js';
import settingsRouter from './routes/settings.js';
import pipelineRouter from './routes/pipeline.js';
import sseRouter from './routes/sse.js';
import { db, schema } from './db/index.js';
import { eq, desc, sql } from 'drizzle-orm';

// Initialize workers (registers them with queues)
import './workers/scrape.worker.js';
import './workers/analyze.worker.js';
import './workers/translate.worker.js';
import './workers/generate.worker.js';
import './workers/publish.worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '3000', 10);

// Ensure runtime directories exist (needed on fresh deployments)
mkdirSync(resolve(PROJECT_ROOT, 'data'), { recursive: true });
mkdirSync(resolve(PROJECT_ROOT, 'public/images/carousels'), { recursive: true });

// Body parsing
app.use(express.json());

// Serve generated carousel images
app.use('/images', express.static(resolve(PROJECT_ROOT, 'public/images')));

// API routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Overview stats endpoint
app.get('/api/stats', (_req, res) => {
  const sources = db.select({ count: sql<number>`count(*)` }).from(schema.sourceChannels).all();
  const destinations = db.select({ count: sql<number>`count(*)` }).from(schema.destinationAccounts).all();
  const totalPosts = db.select({ count: sql<number>`count(*)` }).from(schema.posts).all();
  const viralPosts = db.select({ count: sql<number>`count(*)` }).from(schema.posts).where(eq(schema.posts.is_viral, true)).all();
  const publishedJobs = db.select({ count: sql<number>`count(*)` }).from(schema.publishingJobs).where(eq(schema.publishingJobs.status, 'published')).all();

  res.json({
    success: true,
    data: {
      sources: sources[0]?.count ?? 0,
      destinations: destinations[0]?.count ?? 0,
      total_posts: totalPosts[0]?.count ?? 0,
      viral_posts: viralPosts[0]?.count ?? 0,
      published: publishedJobs[0]?.count ?? 0,
    },
  });
});

// Recent activity endpoint
app.get('/api/activity', (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit as string || '50', 10));
  const logs = db
    .select()
    .from(schema.activityLog)
    .orderBy(desc(schema.activityLog.created_at))
    .limit(limit)
    .all();
  res.json({ success: true, data: logs });
});
app.use('/api/sources', sourcesRouter);
app.use('/api/destinations', destinationsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/routing', routingRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api', sseRouter);

// In production, serve the built client
const clientDist = resolve(PROJECT_ROOT, 'dist/client');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('{*path}', (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
}

// In development, Vite handles client serving via its own dev server + proxy

server.listen(PORT, () => {
  console.log(`[viralzator] Server running on http://localhost:${PORT}`);
});

export { app, server };
