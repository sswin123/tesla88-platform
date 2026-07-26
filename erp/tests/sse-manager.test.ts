import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribeSSE, _resetSSEManager, getActiveSSECount } from '@/lib/sse-manager';

// Mock EventSource implementation (simulates browser EventSource behavior)
class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  url: string;
  readyState: number = MockEventSource.OPEN;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  // Test helpers
  static instances: MockEventSource[] = [];
  static reset() { MockEventSource.instances = []; }

  simulateMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  simulateError(closed = false) {
    if (closed) this.readyState = MockEventSource.CLOSED;
    this.onerror?.();
  }
}

beforeEach(() => {
  MockEventSource.reset();
  _resetSSEManager();
  vi.stubGlobal('EventSource', MockEventSource);
});

describe('subscribeSSE()', () => {
  it('1. first subscribeSSE creates a new EventSource', () => {
    subscribeSSE('/api/test', () => {});
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/test');
  });

  it('2. second subscribeSSE on same URL reuses the existing EventSource', () => {
    subscribeSSE('/api/test', () => {});
    subscribeSSE('/api/test', () => {});
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('3. messages are broadcast to all handlers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    subscribeSSE('/api/test', h1);
    subscribeSSE('/api/test', h2);

    MockEventSource.instances[0].simulateMessage('{"type":"ping"}');

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('4. unsubscribing one handler does not affect other handlers', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    const unsub1 = subscribeSSE('/api/test', h1);
    subscribeSSE('/api/test', h2);

    unsub1();

    MockEventSource.instances[0].simulateMessage('{"type":"ping"}');

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('5. unsubscribing the last handler closes the EventSource', () => {
    const unsub = subscribeSSE('/api/test', () => {});
    const es = MockEventSource.instances[0];

    unsub();

    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });

  it('6. after last handler unsubscribes, a new subscribeSSE creates a fresh EventSource', () => {
    const unsub = subscribeSSE('/api/test', () => {});
    unsub();

    subscribeSSE('/api/test', () => {});

    expect(MockEventSource.instances).toHaveLength(2);
  });

  it('7. onerror with readyState != CLOSED keeps the connection in the Map', () => {
    subscribeSSE('/api/test', () => {});
    const es = MockEventSource.instances[0];

    // readyState remains OPEN (not CLOSED) — transient error, auto-reconnect
    es.simulateError(false);

    expect(getActiveSSECount()).toBe(1);
  });

  it('8. onerror with readyState CLOSED removes the connection from the Map', () => {
    subscribeSSE('/api/test', () => {});
    const es = MockEventSource.instances[0];

    // readyState set to CLOSED — permanent failure
    es.simulateError(true);

    expect(getActiveSSECount()).toBe(0);
  });
});

describe('getActiveSSECount()', () => {
  it('9. returns the correct number of active connections', () => {
    expect(getActiveSSECount()).toBe(0);

    subscribeSSE('/api/url1', () => {});
    expect(getActiveSSECount()).toBe(1);

    subscribeSSE('/api/url2', () => {});
    expect(getActiveSSECount()).toBe(2);

    // Second subscriber on url1 — no new connection
    subscribeSSE('/api/url1', () => {});
    expect(getActiveSSECount()).toBe(2);
  });
});
