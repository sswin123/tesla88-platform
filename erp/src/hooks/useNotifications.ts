'use client';

import { useEffect, useRef } from 'react';
import { isBrowser } from '@/lib/is-browser';
import { playNotification } from '@/lib/notification-audio';
import { subscribeSSE } from '@/lib/sse-manager';

export interface NotifSettings {
  sound: boolean;
  browser: boolean;
  titleFlash: boolean;
}

export const NOTIF_STORAGE_KEY = 'livechat_notif';

const DEFAULT_SETTINGS: NotifSettings = { sound: true, browser: true, titleFlash: true };

export function loadNotifSettings(): NotifSettings {
  if (!isBrowser) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NotifSettings>;
    return {
      sound: parsed.sound ?? true,
      browser: parsed.browser ?? true,
      titleFlash: parsed.titleFlash ?? true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveNotifSettings(s: NotifSettings): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

function showBrowserNotif(): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification('Live Chat', { body: 'New message from customer' });
  } catch {
    // ignore notification errors
  }
}

export function useNotifications(settings: NotifSettings): void {
  const settingsRef = useRef(settings);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    if (!isBrowser) return;

    let flashInterval: ReturnType<typeof setInterval> | null = null;
    let originalTitle = document.title;
    let flashing = false;

    function stopFlash() {
      if (flashInterval !== null) {
        clearInterval(flashInterval);
        flashInterval = null;
      }
      document.title = originalTitle;
      flashing = false;
      window.dispatchEvent(new CustomEvent('erp:titleassert'));
    }

    function startFlash() {
      if (flashing) return;
      if (!document.hidden) return;
      flashing = true;
      originalTitle = document.title;
      let toggle = false;
      flashInterval = setInterval(() => {
        document.title = toggle ? 'Live Chat' : '🔴 New message — Live Chat';
        toggle = !toggle;
      }, 1000);
    }

    function handleVisibilityChange() {
      if (!document.hidden) stopFlash();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const unsub = subscribeSSE('/api/livechat/stream', (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data as string) as { sender_type?: string };
        if (evt.sender_type !== 'USER') return;
        if (settingsRef.current.sound)       playNotification('livechat');
        if (settingsRef.current.browser)     showBrowserNotif();
        if (settingsRef.current.titleFlash)  startFlash();
      } catch { /* ignore parse errors */ }
    });

    return () => {
      unsub();
      stopFlash();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // empty deps — subscribeSSE opens once; reads settingsRef at event time
}
