export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-28 bg-muted rounded" />
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="h-5 w-40 bg-muted rounded" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-9 w-full bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
