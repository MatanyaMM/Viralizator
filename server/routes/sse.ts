import { Router } from 'express';
import { sseBus } from '../services/sse-bus.js';

const router = Router();

router.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', data: {}, timestamp: new Date().toISOString() })}\n\n`);

  sseBus.addClient(res);

  // Keep-alive every 30s
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

export default router;
