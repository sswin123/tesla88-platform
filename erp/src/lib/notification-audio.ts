'use client';

// Centralised notification audio for the ERP.
//
// To add a new sound type:
//   1. Add a key to SOUND_PATHS.
//   2. Place the audio file in /public/sounds/.
//   3. Call playNotification('your-new-key') where needed.
//   No other changes required.
//
// To replace a sound, overwrite the WAV/MP3 file — no code changes needed.

const SOUND_PATHS = {
  transaction: '/sounds/transaction.wav',
  livechat:    '/sounds/livechat.wav',
} as const;

export type NotifSound = keyof typeof SOUND_PATHS;

// Shared AudioContext singleton.
// Created once after a user gesture; reused across all subsequent plays
// (including setInterval callbacks) to avoid "suspended" state.
let _audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!_audioCtx || _audioCtx.state === 'closed') _audioCtx = new Ctor();
    return _audioCtx;
  } catch {
    return null;
  }
}

/** Call once on the first user click to pre-warm the AudioContext. */
export function unlockAudio(): void {
  const ctx = getAudioCtx();
  if (ctx?.state === 'suspended') void ctx.resume();
}

/**
 * Eagerly fetch and decode all notification sounds into the buffer cache.
 * Call after unlockAudio() so the AudioContext is already running.
 * Subsequent playNotification() calls will play instantly from cache.
 */
export function preloadAllNotifications(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  (Object.keys(SOUND_PATHS) as NotifSound[]).forEach((type) => {
    void loadBuffer(type, ctx);
  });
}

// Decoded AudioBuffer cache — keyed by NotifSound.
// null  = load was attempted but failed → use synthesised fallback.
// absent from map = not yet attempted.
const _bufferCache = new Map<NotifSound, AudioBuffer | null>();

async function loadBuffer(type: NotifSound, ctx: AudioContext): Promise<AudioBuffer | null> {
  if (_bufferCache.has(type)) return _bufferCache.get(type) ?? null;
  try {
    const res = await fetch(SOUND_PATHS[type]);
    if (!res.ok) { _bufferCache.set(type, null); return null; }
    const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
    _bufferCache.set(type, decoded);
    return decoded;
  } catch {
    _bufferCache.set(type, null);
    return null;
  }
}

// Synthesised fallback used only when the audio file cannot be loaded.
// Different frequency per type preserves basic distinguishability.
function synthesiseFallback(ctx: AudioContext, type: NotifSound): void {
  const freq = type === 'transaction' ? 1046 : 880;
  const amp  = type === 'transaction' ? 0.30 : 0.20;
  try {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = freq; osc.type = 'sine';
    gain.gain.setValueAtTime(amp, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
  } catch { /* ignore */ }
}

/**
 * Play a notification sound.
 * Safe to call from setInterval — the AudioContext is resumed automatically.
 */
export function playNotification(type: NotifSound): void {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const doPlay = async () => {
    if (ctx.state === 'suspended') await ctx.resume();
    const buffer = await loadBuffer(type, ctx);
    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(ctx.currentTime);
    } else {
      synthesiseFallback(ctx, type);
    }
  };

  void doPlay();
}
