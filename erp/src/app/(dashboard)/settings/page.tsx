'use client';

import { useEffect, useState } from 'react';
import type { SystemSetting } from '@/lib/types';

type Meta = { updated_by: string | null; updated_at: string };

type SectionDef = {
  title: string;
  id: string;
  keys: string[];
};

const SECTIONS: SectionDef[] = [
  { id: 'general',       title: 'General',       keys: ['company_name', 'timezone', 'bot_name'] },
  { id: 'livechat',      title: 'Live Chat',     keys: ['session_timeout_min', 'auto_reply_enabled', 'auto_reply_message'] },
  { id: 'notifications', title: 'Notifications', keys: ['notif_sound'] },
  { id: 'media',         title: 'Media',         keys: ['max_upload_mb', 'retention_days'] },
  { id: 'integration',   title: 'Integration',   keys: ['bot_relay_url'] },
  { id: 'system',        title: 'System',        keys: ['maintenance_mode'] },
];

const BOOL_KEYS = new Set(['notif_sound', 'auto_reply_enabled', 'maintenance_mode']);

const LABELS: Record<string, string> = {
  company_name:       'Company Name',
  timezone:           'Timezone',
  bot_name:           'Bot Name',
  session_timeout_min:'Session Timeout (minutes)',
  auto_reply_enabled: 'Auto-Reply Enabled',
  auto_reply_message: 'Auto-Reply Message',
  notif_sound:        'Notification Sound',
  max_upload_mb:      'Max Upload Size (MB)',
  retention_days:     'Message Retention (days)',
  bot_relay_url:      'Bot Relay URL',
  maintenance_mode:   'Maintenance Mode',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [meta, setMeta]         = useState<Record<string, Meta>>({});
  const [saving, setSaving]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/settings');
      if (!r.ok) { setLoading(false); return; }
      const d = await r.json() as { settings: SystemSetting[] };
      const map: Record<string, string>  = {};
      const metaMap: Record<string, Meta> = {};
      d.settings.forEach((s) => {
        map[s.key]     = s.value;
        metaMap[s.key] = { updated_by: s.updated_by, updated_at: s.updated_at };
      });
      setSettings(map);
      setMeta(metaMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveSection(sectionId: string, keys: string[]) {
    setSaving(sectionId);
    const updates: Record<string, string> = {};
    keys.forEach((k) => { updates[k] = settings[k] ?? ''; });
    try {
      const r = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (r.ok) {
        await load();
      } else {
        alert('Failed to save settings');
      }
    } finally {
      setSaving(null);
    }
  }

  function handleChange(key: string, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleToggle(key: string) {
    setSettings((prev) => ({ ...prev, [key]: prev[key] === 'true' ? 'false' : 'true' }));
  }

  const maintenanceOn = settings['maintenance_mode'] === 'true';

  if (loading) {
    return (
      <div className="p-8 text-gray-500">Loading settings…</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage configurable system parameters. Changes take effect immediately.</p>
      </div>

      {SECTIONS.map((section) => {
        const isSaving = saving === section.id;

        // Collect last-updated metadata for this section
        const sectionMeta = section.keys
          .map((k) => meta[k])
          .filter(Boolean)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        const latestMeta = sectionMeta[0];

        return (
          <div key={section.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">{section.title}</h2>
              {latestMeta && (
                <span className="text-xs text-gray-400">
                  {latestMeta.updated_by
                    ? `Last saved by ${latestMeta.updated_by} at ${formatDate(latestMeta.updated_at)}`
                    : `Last saved at ${formatDate(latestMeta.updated_at)}`}
                </span>
              )}
            </div>

            {/* Maintenance mode warning */}
            {section.id === 'system' && maintenanceOn && (
              <div className="mx-6 mt-4 flex items-start gap-3 rounded-md bg-red-50 border border-red-300 p-4">
                <svg className="h-5 w-5 flex-shrink-0 text-red-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">Maintenance mode is ON</p>
                  <p className="text-sm text-red-600 mt-0.5">New logins are currently blocked. Disable maintenance mode to restore access.</p>
                </div>
              </div>
            )}

            <div className="px-6 py-4 space-y-5">
              {section.keys.map((key) => {
                const label = LABELS[key] ?? key;
                const value = settings[key] ?? '';
                const isBool = BOOL_KEYS.has(key);

                return (
                  <div key={key} className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                      {isBool ? (
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={value === 'true'}
                            onChange={() => handleToggle(key)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-600">{value === 'true' ? 'Enabled' : 'Disabled'}</span>
                        </label>
                      ) : key === 'auto_reply_message' ? (
                        <textarea
                          value={value}
                          onChange={(e) => handleChange(key, e.target.value)}
                          rows={3}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Enter auto-reply message…"
                        />
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleChange(key, e.target.value)}
                          className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                      {meta[key] && (
                        <p className="mt-1 text-xs text-gray-400">
                          {meta[key].updated_by
                            ? `Saved by ${meta[key].updated_by} at ${formatDate(meta[key].updated_at)}`
                            : `Saved at ${formatDate(meta[key].updated_at)}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button
                onClick={() => saveSection(section.id, section.keys)}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Saving…
                  </>
                ) : 'Save'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
