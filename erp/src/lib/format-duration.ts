// erp/src/lib/format-duration.ts
export function formatDuration(fromIso: string | null, now: Date = new Date()): string {
  if (!fromIso) return '—';
  const ms = now.getTime() - new Date(fromIso).getTime();
  if (ms <= 0) return '0m';
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
