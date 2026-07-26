export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-28 bg-gray-200 rounded" />
      <div className="rounded-lg border bg-white p-6 space-y-4">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-24 bg-gray-200 rounded" />
            <div className="h-9 w-full bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
