import { randomUUID } from 'node:crypto';

export type SSEEventType =
  | 'pipeline_progress'
  | 'memory_extracted'
  | 'chapter_complete'
  | 'daemon_event'
  | 'hook_wake'
  | 'thundering_herd'
  | 'quality_drift'
  | 'context_changed';

export class SSEClient {
  readonly id: string;
  lastHeartbeat: number;
  private controller: ReadableStreamDefaultController<string>;

  constructor(controller: ReadableStreamDefaultController<string>) {
    this.id = randomUUID();
    this.lastHeartbeat = Date.now();
    this.controller = controller;
  }

  send(event: SSEEventType, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    try {
      this.controller.enqueue(payload);
      this.lastHeartbeat = Date.now();
    } catch {
      // Client disconnected — will be cleaned up on next interaction
    }
  }

  sendComment(comment: string): void {
    try {
      this.controller.enqueue(`: ${comment}\n\n`);
    } catch {
      // Client disconnected
    }
  }
}

export class EventHub {
  private clients = new Map<string, Map<string, SSEClient>>();

  addClient(bookId: string, client: SSEClient): void {
    let bookClients = this.clients.get(bookId);
    if (!bookClients) {
      bookClients = new Map();
      this.clients.set(bookId, bookClients);
    }
    bookClients.set(client.id, client);
  }

  removeClient(bookId: string, clientId: string): void {
    const bookClients = this.clients.get(bookId);
    if (bookClients) {
      bookClients.delete(clientId);
      if (bookClients.size === 0) {
        this.clients.delete(bookId);
      }
    }
  }

  sendEvent(bookId: string, event: SSEEventType, data: unknown): void {
    const bookClients = this.clients.get(bookId);
    if (!bookClients) return;

    for (const client of bookClients.values()) {
      client.send(event, data);
    }
  }

  getClientCount(bookId: string): number {
    return this.clients.get(bookId)?.size ?? 0;
  }

  getBooks(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Singleton instance shared across the application
export const eventHub = new EventHub();
