'use client';

import { useEffect, useState, useCallback } from 'react';

interface BackupRecord {
  id: number;
  filename: string;
  file_size_bytes: number | null;
  status: 'pending' | 'completed' | 'failed';
  notes: string | null;
  created_at: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: BackupRecord['status'] }) {
  const map = {
    completed: 'bg-green-100 text-green-700',
    pending:   'bg-yellow-100 text-yellow-700',
    failed:    'bg-red-100 text-red-700',
  } as const;
  const label = { completed: '完成', pending: '创建中', failed: '失败' } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[status]}`}>
      {label[status]}
    </span>
  );
}

export default function BackupsPage() {
  const [backups, setBackups]     = useState<BackupRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError]         = useState('');

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/system/backups');
      if (r.ok) setBackups(await r.json() as BackupRecord[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  async function createBackup() {
    setCreating(true);
    setError('');
    try {
      const r = await fetch('/api/system/backups', { method: 'POST' });
      if (r.ok) {
        await loadBackups();
      } else {
        const d = await r.json() as { error: string };
        setError(d.error ?? '备份创建失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setCreating(false);
    }
  }

  async function downloadBackup(id: number, filename: string) {
    setDownloading(id);
    try {
      const r = await fetch(`/api/system/backups/${id}/download`);
      if (!r.ok) {
        const d = await r.json() as { error: string };
        setError(d.error ?? '下载失败');
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('下载失败');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">备份管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            数据库备份列表。保留期限由系统设置 <code className="rounded bg-gray-100 px-1 text-xs">backup_retention_days</code> 控制（默认 30 天）。
          </p>
        </div>
        <button
          onClick={() => void createBackup()}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {creating ? '备份中…' : '创建备份'}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">文件名</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">大小</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">状态</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">创建时间</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">加载中…</td>
              </tr>
            ) : backups.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">暂无备份记录</td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">{b.filename}</td>
                  <td className="px-4 py-3 text-gray-600">{formatBytes(b.file_size_bytes)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={b.status} />
                    {b.notes && <p className="mt-1 text-xs text-red-500 break-all">{b.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(b.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.status === 'completed' && (
                      <button
                        onClick={() => void downloadBackup(b.id, b.filename)}
                        disabled={downloading === b.id}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {downloading === b.id ? '下载中…' : '下载'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
