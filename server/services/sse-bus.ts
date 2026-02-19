import { EventEmitter } from 'events';
import type { Response } from 'express';
import type { SSEEvent } from '../../shared/types.js';

class SSEBus extends EventEmitter {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(event: SSEEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(data);
    }
    this.emit('event', event);
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const sseBus = new SSEBus();
