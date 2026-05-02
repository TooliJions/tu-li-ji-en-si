import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventHub, SSEClient, type SSEEventType } from './sse';

function createMockController(): ReadableStreamDefaultController<string> {
  return { enqueue: vi.fn() } as unknown as ReadableStreamDefaultController<string>;
}

describe('SSE Infrastructure', () => {
  describe('SSEClient', () => {
    it('creates a client with unique id', () => {
      const controller = createMockController();
      const client = new SSEClient(controller);
      expect(client.id).toBeDefined();
      expect(typeof client.id).toBe('string');
    });

    it('records last heartbeat timestamp', () => {
      const controller = createMockController();
      const client = new SSEClient(controller);
      expect(client.lastHeartbeat).toBeDefined();
      expect(client.lastHeartbeat).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('EventHub', () => {
    let hub: EventHub;

    beforeEach(() => {
      hub = new EventHub();
    });

    it('registers a new client for a bookId', () => {
      const controller = {} as ReadableStreamDefaultController<string>;
      const client = new SSEClient(controller);

      hub.addClient('book-001', client);

      expect(hub.getClientCount('book-001')).toBe(1);
    });

    it('removes a client by id', () => {
      const controller = {} as ReadableStreamDefaultController<string>;
      const client = new SSEClient(controller);

      hub.addClient('book-001', client);
      hub.removeClient('book-001', client.id);

      expect(hub.getClientCount('book-001')).toBe(0);
    });

    it('sends an event to all clients of a bookId', () => {
      const sent: string[] = [];
      const mockController = {
        enqueue: (chunk: string) => sent.push(chunk),
      } as unknown as ReadableStreamDefaultController<string>;

      const client = new SSEClient(mockController);
      hub.addClient('book-001', client);

      hub.sendEvent('book-001', 'pipeline_progress', {
        pipelineId: 'p1',
        stage: 'writing',
        progress: 0.5,
      });

      expect(sent.length).toBe(1);
      expect(sent[0]).toContain('event: pipeline_progress');
      expect(sent[0]).toContain('pipelineId');
      expect(sent[0]).toContain('p1');
    });

    it('does not send events to clients of other bookIds', () => {
      const sent: string[] = [];
      const mockController = {
        enqueue: (chunk: string) => sent.push(chunk),
      } as unknown as ReadableStreamDefaultController<string>;

      const client1 = new SSEClient(mockController);
      hub.addClient('book-001', client1);

      const sent2: string[] = [];
      const mockController2 = {
        enqueue: (chunk: string) => sent2.push(chunk),
      } as unknown as ReadableStreamDefaultController<string>;
      const client2 = new SSEClient(mockController2);
      hub.addClient('book-002', client2);

      hub.sendEvent('book-001', 'chapter_complete', { chapterNumber: 1 });

      expect(sent.length).toBe(1);
      expect(sent2.length).toBe(0);
    });

    it('supports all required event types', () => {
      const eventTypes = [
        'pipeline_progress',
        'memory_extracted',
        'chapter_complete',
        'hook_wake',
        'thundering_herd',
        'quality_drift',
        'context_changed',
      ];

      const sent: string[] = [];
      const mockController = {
        enqueue: (chunk: string) => sent.push(chunk),
      } as unknown as ReadableStreamDefaultController<string>;

      const client = new SSEClient(mockController);
      hub.addClient('book-001', client);

      for (const type of eventTypes as SSEEventType[]) {
        hub.sendEvent('book-001', type, { test: true });
      }

      expect(sent.length).toBe(eventTypes.length);
      for (const [i, type] of eventTypes.entries()) {
        expect(sent[i]).toContain(`event: ${type}`);
      }
    });

    it('tracks clients per book independently', () => {
      const c1 = new SSEClient({} as ReadableStreamDefaultController<string>);
      const c2 = new SSEClient({} as ReadableStreamDefaultController<string>);
      const c3 = new SSEClient({} as ReadableStreamDefaultController<string>);

      hub.addClient('book-001', c1);
      hub.addClient('book-001', c2);
      hub.addClient('book-002', c3);

      expect(hub.getClientCount('book-001')).toBe(2);
      expect(hub.getClientCount('book-002')).toBe(1);
    });

    it('returns empty array for unknown bookId', () => {
      expect(hub.getClientCount('unknown')).toBe(0);
    });

    it('broadcasts to multiple clients of the same book', () => {
      const sent: string[][] = [];
      const makeMock = () => {
        const s: string[] = [];
        sent.push(s);
        return {
          enqueue: (chunk: string) => s.push(chunk),
        } as unknown as ReadableStreamDefaultController<string>;
      };

      hub.addClient('book-001', new SSEClient(makeMock()));
      hub.addClient('book-001', new SSEClient(makeMock()));
      hub.addClient('book-001', new SSEClient(makeMock()));

      hub.sendEvent('book-001', 'hook_wake', { data: 1 });

      expect(sent.length).toBe(3);
      for (const s of sent) {
        expect(s.length).toBe(1);
        expect(s[0]).toContain('hook_wake');
      }
    });
  });
});
