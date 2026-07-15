'use client';

import { useEffect, useState, useCallback } from 'react';
import { MediaPicker } from '@/components/media/MediaPicker';
import type { MediaRecord } from '@/lib/media/types';
import {
  ChevronUp, ChevronDown, Trash2, Plus, Eye, EyeOff, Save, AlertCircle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  button_text: string;
  button_url: string;
  desktop_media_id: number | null;
  desktop_media_url: string;
  desktop_media_type: string;
  desktop_mime_type: string;
  mobile_media_id: number | null;
  mobile_media_url: string;
  mobile_media_type: string;
  mobile_mime_type: string;
  enabled: boolean;
  display_order: number;
}

interface BannerConfig {
  section_id: number | null;
  slides: BannerSlide[];
  autoplay_interval: number;
  show_arrows: boolean;
  show_dots: boolean;
}

// ─── Media Card ────────────────────────────────────────────────────────────────

function MediaCard({
  label,
  hint,
  mediaUrl,
  mediaType,
  mimeType,
  onPickClick,
  onDelete,
}: {
  label: string;
  hint: string;
  mediaUrl: string;
  mediaType: string;
  mimeType: string;
  onPickClick: () => void;
  onDelete: () => void;
}) {
  const hasMedia = !!mediaUrl;
  const isVideo  = mediaType === 'VIDEO' || mimeType.startsWith('video/');
  const isGif    = mediaType === 'GIF'   || mimeType === 'image/gif';

  return (
    <div>
      <p className="text-xs font-medium text-gray-600 mb-1">{label}</p>

      {hasMedia ? (
        <div
          className="relative rounded-lg overflow-hidden border-2 border-gray-200 bg-black cursor-pointer group"
          style={{ height: 100 }}
          onClick={onPickClick}
          title="点击更换媒体"
        >
          {isVideo ? (
            <video src={mediaUrl} className="w-full h-full object-cover opacity-80" muted />
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 flex items-center justify-center transition-all">
            <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              点击更换
            </span>
          </div>
          <span className="absolute top-1.5 left-1.5 text-[10px] font-semibold bg-black/60 text-white px-1.5 py-0.5 rounded">
            {isVideo ? 'VIDEO' : isGif ? 'GIF' : 'IMAGE'}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPickClick}
          className="w-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 transition-colors"
          style={{ height: 100 }}
        >
          <Plus className="w-5 h-5" />
          <span className="text-xs">上传媒体</span>
        </button>
      )}

      {hasMedia && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
        >
          <Trash2 className="w-3 h-3" /> 删除媒体
        </button>
      )}

      <p className="mt-1.5 text-[10px] text-gray-400">{hint}</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function WebsiteBannersPage() {
  const [config, setConfig]       = useState<BannerConfig | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');
  const [pickerFor, setPickerFor] = useState<{ slideId: string; field: 'desktop' | 'mobile' } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/website/banner-slides');
      const data = await res.json() as BannerConfig;
      setConfig(data);
    } catch {
      setError('加载失败，请刷新页面');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function updateSlide(id: string, patch: Partial<BannerSlide>) {
    setConfig(prev => {
      if (!prev) return prev;
      return { ...prev, slides: prev.slides.map(s => s.id === id ? { ...s, ...patch } : s) };
    });
  }

  function clearMedia(slideId: string, field: 'desktop' | 'mobile') {
    updateSlide(slideId, {
      [`${field}_media_id`]:   null,
      [`${field}_media_url`]:  '',
      [`${field}_media_type`]: '',
      [`${field}_mime_type`]:  '',
    } as Partial<BannerSlide>);
  }

  function addSlide() {
    const newSlide: BannerSlide = {
      id:                Date.now().toString(),
      title:             '', subtitle: '', button_text: '', button_url: '',
      desktop_media_id:  null, desktop_media_url: '', desktop_media_type: '', desktop_mime_type: '',
      mobile_media_id:   null, mobile_media_url:  '', mobile_media_type:  '', mobile_mime_type:  '',
      enabled:           true,
      display_order:     (config?.slides.length ?? 0) * 10,
    };
    setConfig(prev => prev ? { ...prev, slides: [...prev.slides, newSlide] } : prev);
  }

  function removeSlide(id: string) {
    if (!confirm('确定要删除此横幅吗？')) return;
    setConfig(prev => prev ? { ...prev, slides: prev.slides.filter(s => s.id !== id) } : prev);
  }

  function moveSlide(idx: number, dir: 'up' | 'down') {
    setConfig(prev => {
      if (!prev) return prev;
      const next = [...prev.slides];
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, slides: next.map((s, i) => ({ ...s, display_order: i * 10 })) };
    });
  }

  function handleMediaSelect(media: MediaRecord | MediaRecord[]) {
    if (!pickerFor) return;
    const single = Array.isArray(media) ? media[0] : media;
    if (!single) return;
    const { slideId, field } = pickerFor;
    updateSlide(slideId, {
      [`${field}_media_id`]:   single.id,
      [`${field}_media_url`]:  `/api/public/media/${single.id}`,
      [`${field}_media_type`]: single.mediaType ?? 'IMAGE',
      [`${field}_mime_type`]:  single.mimeType  ?? 'image/jpeg',
    } as Partial<BannerSlide>);
    setPickerFor(null);
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/website/banner-slides', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(config),
      });
      if (!res.ok) { setError('保存失败，请重试'); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('保存失败，请检查网络连接');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">加载中…</div>
      </div>
    );
  }

  const slides = config?.slides ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">横幅轮播管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理首页横幅图片，更改后立即生效</p>
        </div>
        <button
          onClick={addSlide}
          className="flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> 添加横幅
        </button>
      </div>

      {/* Global settings */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-wrap gap-5 items-center">
        <div>
          <label className="block text-xs text-gray-500 mb-1">自动播放间隔（毫秒）</label>
          <input
            type="text"
            inputMode="numeric"
            min={1000} step={500}
            value={config?.autoplay_interval ?? 5000}
            onChange={e => {
              const v = e.target.value;
              if (v === '' || /^\d*$/.test(v)) setConfig(prev => prev ? { ...prev, autoplay_interval: v === '' ? 5000 : parseInt(v, 10) } : prev);
            }}
            onBlur={e => {
              const n = parseInt(e.target.value, 10);
              setConfig(prev => prev ? { ...prev, autoplay_interval: isNaN(n) || n < 1000 ? 5000 : n } : prev);
            }}
            className="w-28 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={config?.show_arrows ?? true}
            onChange={e => setConfig(prev => prev ? { ...prev, show_arrows: e.target.checked } : prev)}
            className="rounded"
          />
          显示左右箭头
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={config?.show_dots ?? true}
            onChange={e => setConfig(prev => prev ? { ...prev, show_dots: e.target.checked } : prev)}
            className="rounded"
          />
          显示圆点导航
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Slides */}
      {slides.length === 0 ? (
        <div
          className="border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 py-16 cursor-pointer hover:border-blue-400 transition-colors"
          onClick={addSlide}
        >
          <Plus className="w-8 h-8 text-gray-300" />
          <p className="text-sm text-gray-400">暂无横幅，点击添加第一张</p>
        </div>
      ) : (
        <div className="space-y-4">
          {slides.map((slide, idx) => (
            <div key={slide.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">

              {/* Slide header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">横幅 {idx + 1}</span>
                  {!slide.desktop_media_url && (
                    <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">缺少桌面图片</span>
                  )}
                  {!slide.enabled && (
                    <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">已隐藏</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSlide(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                    title="上移"
                  >
                    <ChevronUp className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(idx, 'down')}
                    disabled={idx === slides.length - 1}
                    className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
                    title="下移"
                  >
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSlide(slide.id, { enabled: !slide.enabled })}
                    className={`p-1.5 rounded transition-colors ${slide.enabled ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100'}`}
                    title={slide.enabled ? '已显示（点击隐藏）' : '已隐藏（点击显示）'}
                  >
                    {slide.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlide(slide.id)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    title="删除横幅"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Slide body */}
              <div className="p-4 space-y-4">

                {/* Media pickers */}
                <div className="grid grid-cols-2 gap-4">
                  <MediaCard
                    label="桌面端图片 / 视频"
                    hint="推荐 1920×600 px · 16:5 · 最大 10MB · JPG/PNG/WEBP/GIF/MP4"
                    mediaUrl={slide.desktop_media_url}
                    mediaType={slide.desktop_media_type}
                    mimeType={slide.desktop_mime_type}
                    onPickClick={() => setPickerFor({ slideId: slide.id, field: 'desktop' })}
                    onDelete={() => clearMedia(slide.id, 'desktop')}
                  />
                  <MediaCard
                    label="手机端图片 / 视频"
                    hint="推荐 1080×1350 px · 4:5 · 最大 8MB · JPG/PNG/WEBP/GIF/MP4"
                    mediaUrl={slide.mobile_media_url}
                    mediaType={slide.mobile_media_type}
                    mimeType={slide.mobile_mime_type}
                    onPickClick={() => setPickerFor({ slideId: slide.id, field: 'mobile' })}
                    onDelete={() => clearMedia(slide.id, 'mobile')}
                  />
                </div>

                {/* Text fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">标题（可选）</label>
                    <input
                      placeholder="横幅标题"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.title}
                      onChange={e => updateSlide(slide.id, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">副标题（可选）</label>
                    <input
                      placeholder="横幅副标题"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.subtitle}
                      onChange={e => updateSlide(slide.id, { subtitle: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">按钮文字（可选）</label>
                    <input
                      placeholder="例：立即游戏"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.button_text}
                      onChange={e => updateSlide(slide.id, { button_text: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-0.5">按钮链接（可选）</label>
                    <input
                      placeholder="例：/promotions"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                      value={slide.button_url}
                      onChange={e => updateSlide(slide.id, { button_url: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save bar */}
      <div className="sticky bottom-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-2xl shadow-lg transition-all"
          style={{
            background: saved
              ? '#22c55e'
              : saving ? '#93c5fd' : '#2563eb',
            color: '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          <Save className="w-4 h-4" />
          {saved ? '已保存 ✓' : saving ? '保存中…' : '保存更改'}
        </button>
      </div>

      {/* Media Picker modal */}
      {pickerFor && (
        <MediaPicker
          onSelect={handleMediaSelect}
          onClose={() => setPickerFor(null)}
          typeFilter={['IMAGE', 'GIF', 'VIDEO']}
        />
      )}
    </div>
  );
}
