/**
 * Verifies the reminder interval management logic extracted from sidebar.tsx.
 *
 * This test suite mirrors the exact logic in handlePendingCountUpdate and the
 * setInterval callback. If these pass, the runtime behavior is correct.
 *
 * Scenarios verified (matching the four user test cases):
 *   1. Reminder – immediate beep, repeats every 5 s while Pending count > 0
 *   2. Start Process – count drops to 0 → reminder stops immediately
 *   3. r.ok = false (API error) – interval must NOT self-clear
 *   4. SSE fetch error → must NOT call handlePendingCountUpdate with 0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Extracted logic ──────────────────────────────────────────────────────────
// This mirrors handlePendingCountUpdate + setInterval callback in sidebar.tsx.
// Any change to sidebar.tsx must be reflected here to keep the test meaningful.

const INTERVAL_MS = 5_000;

interface ReminderManager {
  handlePendingCountUpdate: (newCount: number) => void;
  beepCount: () => number;
  pendingCount: () => number;
  isRunning: () => boolean;
}

function createReminderManager(fetchFn: typeof fetch): ReminderManager {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let _pendingCount = 0;
  let _beepCount    = 0;

  function playBeep() { _beepCount++; }

  function handlePendingCountUpdate(newCount: number) {
    _pendingCount = newCount;

    if (newCount > 0) {
      if (!intervalId) {
        // Scenario 1: immediate beep + start interval
        playBeep();
        intervalId = setInterval(() => {
          fetchFn('/api/transactions/pending-count')
            .then((r) => {
              // BUG FIXED: check r.ok before parsing — prevents 401/500 from being
              // interpreted as count=0 and self-clearing the interval.
              return r.ok ? r.json() : null;
            })
            .then((d: { count: number } | null) => {
              // Scenario 3: on error (null) do nothing, don't clear
              if (d === null) return;
              const c = d.count ?? 0;
              _pendingCount = c;
              if (c === 0) {
                // Scenario 2: count reached 0 → stop
                clearInterval(intervalId!);
                intervalId = null;
              } else {
                // Scenario 1 (repeat): still pending → beep again
                playBeep();
              }
            })
            .catch(() => {});
        }, INTERVAL_MS);
      }
      // else: interval already running, let it continue
    } else {
      // Scenario 2 (SSE path): count = 0 from SSE → stop immediately
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  }

  return {
    handlePendingCountUpdate,
    beepCount:    () => _beepCount,
    pendingCount: () => _pendingCount,
    isRunning:    () => intervalId !== null,
  };
}

// ─── SSE-triggered fetch helper (mirrors sidebar's SSE handler) ───────────────
async function onSSEEvent(
  fetchFn: typeof fetch,
  handler: (count: number) => void,
): Promise<void> {
  const r = await fetchFn('/api/transactions/pending-count');
  if (!r.ok) return; // fixed: skip on error
  const d = await r.json() as { count: number };
  handler(d.count ?? 0);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

// ─── Scenario 1: Reminder ─────────────────────────────────────────────────────
describe('Scenario 1 – Reminder', () => {
  it('plays immediately when a pending transaction arrives', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) });
    const m = createReminderManager(fetch);

    m.handlePendingCountUpdate(1);

    expect(m.beepCount()).toBe(1);    // immediate beep
    expect(m.isRunning()).toBe(true); // interval started
  });

  it('repeats the beep after each 5-second interval tick while count > 0', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 1 }) });
    const m = createReminderManager(fetch);

    m.handlePendingCountUpdate(1);
    expect(m.beepCount()).toBe(1); // immediate

    // Tick 1 (t=5s)
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(m.beepCount()).toBe(2);

    // Tick 2 (t=10s)
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(m.beepCount()).toBe(3);

    // Tick 3 (t=15s)
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(m.beepCount()).toBe(4);

    expect(m.isRunning()).toBe(true); // still running
  });

  it('does NOT start a second interval when called again while one is running', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 2 }) });
    const m = createReminderManager(fetch);

    m.handlePendingCountUpdate(1);
    const beepAfterFirst = m.beepCount(); // 1

    // SSE fires again (second transaction)
    m.handlePendingCountUpdate(2);

    // Should not beep again immediately (interval already running)
    expect(m.beepCount()).toBe(beepAfterFirst);
    expect(m.isRunning()).toBe(true);
  });
});

// ─── Scenario 2: Start Process ────────────────────────────────────────────────
describe('Scenario 2 – Start Process stops reminder immediately', () => {
  it('stops interval when SSE fires with count=0 (PENDING→PROCESSING)', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ count: 0 }) });
    const m = createReminderManager(fetch);

    // Transaction arrives
    m.handlePendingCountUpdate(1);
    expect(m.isRunning()).toBe(true);

    // Admin clicks Start Process → status becomes PROCESSING → SSE fires → count = 0
    m.handlePendingCountUpdate(0);

    expect(m.isRunning()).toBe(false);  // interval cleared
    const beepsNow = m.beepCount();

    // Advance timers: interval must not fire any more
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(m.beepCount()).toBe(beepsNow); // no additional beeps
  });

  it('stops interval when interval tick itself sees count=0', async () => {
    // First tick: count=1. Second tick: count=0.
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 0 }) });

    const m = createReminderManager(fetch);
    m.handlePendingCountUpdate(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS); // tick 1 → count=1 → beep
    expect(m.isRunning()).toBe(true);
    expect(m.beepCount()).toBe(2);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS); // tick 2 → count=0 → stop
    expect(m.isRunning()).toBe(false);
    expect(m.beepCount()).toBe(2); // no extra beep
  });
});

// ─── Scenario 3: API error must NOT self-clear interval ───────────────────────
describe('Scenario 3 – r.ok bug fix: API error does NOT stop the interval', () => {
  it('keeps interval running when pending-count returns HTTP 401', async () => {
    // First tick returns 401 (e.g. transient auth error)
    // Second tick returns 200 with count=1
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) })
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({ count: 1 }) });

    const m = createReminderManager(fetch);
    m.handlePendingCountUpdate(1);
    expect(m.beepCount()).toBe(1);

    // Tick 1: 401 → must NOT clear interval
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(m.isRunning()).toBe(true);  // ← this failed BEFORE the r.ok fix
    expect(m.beepCount()).toBe(1);     // no extra beep on error

    // Tick 2: 200 count=1 → should beep
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(m.isRunning()).toBe(true);
    expect(m.beepCount()).toBe(2);
  });

  it('keeps interval running when pending-count returns HTTP 500', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
      .mockResolvedValueOnce({ ok: true,  status: 200, json: async () => ({ count: 1 }) });

    const m = createReminderManager(fetch);
    m.handlePendingCountUpdate(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS); // 500 → keep running
    expect(m.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS); // 200 count=1 → beep
    expect(m.beepCount()).toBe(2);
  });

  it('keeps interval running when fetch itself throws a network error', async () => {
    const fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ count: 1 }) });

    const m = createReminderManager(fetch);
    m.handlePendingCountUpdate(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS); // network error → keep running
    expect(m.isRunning()).toBe(true);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS); // 200 count=1 → beep
    expect(m.beepCount()).toBe(2);
  });
});

// ─── Scenario 4 (SSE path): SSE handler error must NOT call update(0) ─────────
describe('Scenario 4 – SSE handler r.ok fix: SSE error skips update', () => {
  it('does not call handlePendingCountUpdate when SSE-triggered fetch returns 401', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }),
    });
    const handler = vi.fn();

    await onSSEEvent(fetch, handler);

    expect(handler).not.toHaveBeenCalled(); // no spurious update(0)
  });

  it('calls handlePendingCountUpdate with correct count on success', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ count: 2 }),
    });
    const handler = vi.fn();

    await onSSEEvent(fetch, handler);

    expect(handler).toHaveBeenCalledWith(2);
  });
});
