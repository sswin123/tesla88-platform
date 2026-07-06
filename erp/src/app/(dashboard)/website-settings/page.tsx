'use client';
import { useEffect, useState } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';

interface SiteSettings {
  site_brand_name: string; site_primary_color: string; site_logo_media_id: string;
  site_banner_text: string; site_banner_media_id: string; site_contact_email: string;
  site_contact_phone: string; site_seo_title: string; site_seo_description: string;
  site_terms_url: string; website_enabled: string;
}

const DEFAULTS: SiteSettings = {
  site_brand_name: '', site_primary_color: '#3B82F6', site_logo_media_id: '',
  site_banner_text: '', site_banner_media_id: '', site_contact_email: '',
  site_contact_phone: '', site_seo_title: '', site_seo_description: '',
  site_terms_url: '', website_enabled: 'true',
};

const LABELS: Record<keyof SiteSettings, string> = {
  site_brand_name: 'Brand Name', site_primary_color: 'Primary Color (hex)',
  site_logo_media_id: 'Logo', site_banner_text: 'Banner Text',
  site_banner_media_id: 'Banner Image', site_contact_email: 'Contact Email',
  site_contact_phone: 'Contact Phone', site_seo_title: 'SEO Title',
  site_seo_description: 'SEO Description', site_terms_url: 'Terms URL',
  website_enabled: 'Website Enabled',
};

export default function WebsiteSettingsPage() {
  const [form, setForm]           = useState<SiteSettings>(DEFAULTS);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [error, setError]         = useState('');
  const [pickerFor, setPickerFor] = useState<'logo' | 'banner' | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((data: { settings: { key: string; value: string }[] }) => {
        const patch: Partial<SiteSettings> = {};
        for (const r of data.settings ?? []) {
          if (r.key in DEFAULTS) (patch as Record<string, string>)[r.key] = r.value;
        }
        setForm(prev => ({ ...prev, ...patch }));
      })
      .catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setError('');
    // PATCH expects Record<string, string>
    const updates: Record<string, string> = {};
    for (const [key, value] of Object.entries(form)) {
      updates[key] = value;
    }
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
      headers: { 'Content-Type': 'application/json' },
    });
    setSaving(false);
    if (res.ok) setMsg('Settings saved.');
    else {
      const d = await res.json() as { error: string };
      setError(d.error ?? 'Failed to save');
    }
  }

  function setField(key: keyof SiteSettings) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }));
  }

  function handleMediaSelect(field: 'site_logo_media_id' | 'site_banner_media_id', media: MediaRecord | MediaRecord[]) {
    const picked = Array.isArray(media) ? media[0] : media;
    if (picked) setForm(prev => ({ ...prev, [field]: String(picked.id) }));
    setPickerFor(null);
  }

  const TEXT_FIELDS: (keyof SiteSettings)[] = [
    'site_brand_name', 'site_primary_color', 'site_banner_text',
    'site_contact_email', 'site_contact_phone', 'site_seo_title', 'site_terms_url',
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Website Settings</h1>
      <form onSubmit={save} className="space-y-5">
        {msg   && <div className="text-green-700 text-sm bg-green-50 border border-green-200 rounded p-3">{msg}</div>}
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-3">{error}</div>}

        <div className="flex items-center gap-3">
          <input type="checkbox" id="enabled" checked={form.website_enabled === 'true'}
            onChange={e => setForm(prev => ({ ...prev, website_enabled: e.target.checked ? 'true' : 'false' }))}
            className="h-4 w-4 rounded border-gray-300" />
          <label htmlFor="enabled" className="text-sm font-medium text-gray-700">{LABELS.website_enabled}</label>
        </div>

        {TEXT_FIELDS.map(key => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{LABELS[key]}</label>
            <input value={form[key]} onChange={setField(key)} type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{LABELS.site_seo_description}</label>
          <textarea value={form.site_seo_description} onChange={setField('site_seo_description')} rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{LABELS.site_logo_media_id}</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPickerFor('logo')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              {form.site_logo_media_id ? `Media #${form.site_logo_media_id}` : 'Pick Logo'}
            </button>
            {form.site_logo_media_id && (
              <button type="button" onClick={() => setForm(prev => ({ ...prev, site_logo_media_id: '' }))}
                className="text-xs text-red-600 hover:underline">Clear</button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{LABELS.site_banner_media_id}</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPickerFor('banner')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              {form.site_banner_media_id ? `Media #${form.site_banner_media_id}` : 'Pick Banner Image'}
            </button>
            {form.site_banner_media_id && (
              <button type="button" onClick={() => setForm(prev => ({ ...prev, site_banner_media_id: '' }))}
                className="text-xs text-red-600 hover:underline">Clear</button>
            )}
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </form>

      {pickerFor === 'logo' && (
        <MediaPicker
          onSelect={m => handleMediaSelect('site_logo_media_id', m)}
          onClose={() => setPickerFor(null)}
          typeFilter={['IMAGE']}
        />
      )}
      {pickerFor === 'banner' && (
        <MediaPicker
          onSelect={m => handleMediaSelect('site_banner_media_id', m)}
          onClose={() => setPickerFor(null)}
          typeFilter={['IMAGE']}
        />
      )}
    </div>
  );
}
