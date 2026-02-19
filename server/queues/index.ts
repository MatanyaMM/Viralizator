import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

// Redis connection — falls back to in-memory processing when not available
const REDIS_URL = process.env.REDIS_URL || '';

let connection: ConnectionOptions | undefined;
let useInMemory = false;

if (REDIS_URL) {
  const url = new URL(REDIS_URL);
  connection = {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
  };
} else {
  // Check if local Redis is available
  try {
    const net = await import('net');
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: 6379 }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', reject);
      socket.setTimeout(1000, () => {
        socket.destroy();
        reject(new Error('timeout'));
      });
    });
    connection = { host: '127.0.0.1', port: 6379 };
    console.log('[queues] Connected to local Redis');
  } catch {
    useInMemory = true;
    console.log('[queues] No Redis available — using in-memory job processing');
  }
}

// ── Queue definitions ──

type JobProcessor<T> = (job: Job<T>) => Promise<void>;

interface QueueDef<T = unknown> {
  queue: Queue<T> | null;
  processor: JobProcessor<T> | null;
  worker: Worker<T> | null;
}

const queues: Record<string, QueueDef> = {};

function createQueue<T>(name: string, concurrency = 1): Queue<T> | null {
  if (useInMemory) {
    queues[name] = { queue: null, processor: null, worker: null };
    return null;
  }

  const queue = new Queue<T>(name, { connection });
  queues[name] = { queue: queue as Queue, processor: null, worker: null };
  return queue;
}

function registerWorker<T>(name: string, processor: JobProcessor<T>, concurrency = 1): void {
  if (useInMemory) {
    if (queues[name]) {
      queues[name].processor = processor as JobProcessor<unknown>;
    }
    return;
  }

  const worker = new Worker<T>(name, processor, {
    connection,
    concurrency,
  });

  worker.on('completed', (job) => {
    console.log(`[${name}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[${name}] Job ${job?.id} failed:`, err.message);
  });

  if (queues[name]) {
    queues[name].worker = worker as Worker;
  }
}

async function addJob<T>(queueName: string, data: T, opts?: { delay?: number; attempts?: number }): Promise<void> {
  if (useInMemory) {
    const def = queues[queueName];
    if (def?.processor) {
      // Process synchronously in dev mode
      const fakeJob = { id: `mem-${Date.now()}`, data, name: queueName, attemptsMade: 0 } as unknown as Job<T>;
      try {
        await def.processor(fakeJob as Job);
      } catch (err) {
        console.error(`[${queueName}] In-memory job failed:`, err);
      }
    }
    return;
  }

  const def = queues[queueName];
  if (def?.queue) {
    await def.queue.add(queueName, data as Record<string, unknown>, {
      delay: opts?.delay,
      attempts: opts?.attempts ?? 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

// ── Exports ──

export const scrapeQueue = createQueue('scrape', 3);
export const analyzeQueue = createQueue('analyze', 5);
export const translateQueue = createQueue('translate', 3);
export const generateQueue = createQueue('generate', 2);
export const publishQueue = createQueue('publish', 2);

export { registerWorker, addJob, useInMemory };
