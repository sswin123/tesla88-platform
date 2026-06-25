'use client';

import { useState } from 'react';
import { type NotifSettings, saveNotifSettings } from '@/hooks/useNotifications';

interface NotificationSettingsProps {
  settings: NotifSettings;
  onChange: (s: NotifSettings) => void;
}

export function NotificationSettings({ settings, onChange }: NotificationSettingsProps) {
  const [open, setOpen] = useState(false);

  function handleToggle(key: keyof NotifSettings) {
    const next: NotifSettings = { ...settings, [key]: !settings[key] };

    if (key === 'browser' && next.browser) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {
          // ignore permission errors
        });
      }
    }

    saveNotifSettings(next);
    onChange(next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-gray-400 hover:text-gray-600 text-base leading-none p-1"
        title="Notification settings"
        aria-label="Notification settings"
      >
        🔔
      </button>

      {open && (
        <>
          {/* Click-outside overlay */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />

          {/* Popover */}
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded shadow-lg p-3 w-52 text-sm">
            <p className="font-semibold text-gray-700 mb-2">Notifications</p>

            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.sound}
                onChange={() => handleToggle('sound')}
                className="accent-blue-500"
              />
              <span>Sound</span>
            </label>

            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.browser}
                onChange={() => handleToggle('browser')}
                className="accent-blue-500"
              />
              <span>Browser notification</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.titleFlash}
                onChange={() => handleToggle('titleFlash')}
                className="accent-blue-500"
              />
              <span>Flash title</span>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
