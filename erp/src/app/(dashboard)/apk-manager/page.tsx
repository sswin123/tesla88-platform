'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';

interface ApkVersion {
  id: number; version_name: string; version_code: number; release_notes: string | null;
  media_id: number | null; min_android: string; is_current: boolean;
  force_update: boolean; download_count: number; created_by: string; created_at: string;
}

interface FormState {
  version_name: string; version_code: string; release_notes: string;
  media_id: number | null; min_android: string; is_current: boolean; force_update: boolean;
}

const BLANK: FormState = {
  version_name: '', version_code: '', release_notes: '', media_id: null,
  min_android: '6.0', is_current: false, force_update: false,
};

export default function ApkManagerPage() {
  const [versions, setVersions]   = useState<ApkVersion[]>([]);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');
  const [showPicker, setShowPicker] = useState(false);

  async function load() {
    const res = await fetch('/api/apk');
    if (res.ok) setVersions(await res.json() as ApkVersion[]);
  }

  useEffect(() => { void load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    const res = await fetch('/api/apk', {
      method: 'POST',
      body: JSON.stringify({ ...form, version_code: parseInt(form.version_code) }),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);
    if (res.ok) { setMsg('APK version created.'); setForm(BLANK); void load(); }
    else { const d = await res.json() as { error: string }; setError(d.error); }
  }

  async function setCurrent(id: number) {
    await fetch(`/api/apk/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_current: true }),
      headers: { 'Content-Type': 'application/json' },
    });
    void load();
  }

  async function deleteVersion(id: number) {
    if (!confirm('Delete this APK version?')) return;
    const res = await fetch(`/api/apk/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json() as { error: string }; alert(d.error); return; }
    void load();
  }

  function handleMediaSelect(media: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(media) ? media[0] : media;
    if (picked) setForm(prev => ({ ...prev, media_id: picked.id }));
    setShowPicker(false);
  }

  const TEXT_FIELDS: { key: keyof FormState; label: string; ph: string }[] = [
    { key: 'version_name', label: 'Version Name', ph: 'e.g. 1.2.0' },
    { key: 'version_code', label: 'Version Code', ph: 'e.g. 12' },
    { key: 'min_android',  label: 'Min Android',  ph: 'e.g. 6.0' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">APK Manager</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-lg font-semibold mb-4">Add New Version</h2>
          <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            {msg   && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-2">{msg}</div>}
            {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}
            {TEXT_FIELDS.map(({ key, label, ph }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input value={form[key] as string} placeholder={ph} required
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Release Notes</label>
              <textarea value={form.release_notes} rows={3}
                onChange={e => setForm(prev => ({ ...prev, release_notes: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">APK File</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowPicker(true)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                  {form.media_id ? `Media #${form.media_id}` : 'Pick APK File'}
                </button>
                {form.media_id && (
                  <button type="button" onClick={() => setForm(prev => ({ ...prev, media_id: null }))}
                    className="text-xs text-red-600 hover:underline">Clear</button>
                )}
              </div>
            </div>
            <div className="flex gap-6">
              {([['is_current', 'Set as current'], ['force_update', 'Force update']] as [keyof FormState, string][]).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form[key] as boolean}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300" />
                  {label}
                </label>
              ))}
            </div>
            <button type="submit" disabled={saving}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Creating…' : 'Add Version'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">All Versions</h2>
          {versions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">No APK versions yet.</div>
          ) : (
            <div className="space-y-3">
              {versions.map(v => (
                <div key={v.id} className={`bg-white rounded-xl border p-4 ${v.is_current ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{v.version_name}</span>
                        {v.is_current && <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Current</span>}
                        {v.force_update && <span className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">Force</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Build {v.version_code} · Android {v.min_android}+ · {v.download_count} downloads</p>
                      {v.release_notes && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{v.release_notes}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {!v.is_current && (
                        <button onClick={() => setCurrent(v.id)} className="text-xs px-2 py-1 border border-blue-300 text-blue-700 rounded hover:bg-blue-50">Set Current</button>
                      )}
                      <button onClick={() => deleteVersion(v.id)} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setShowPicker(false)}
          typeFilter={['APK']}
        />
      )}
    </div>
  );
}
