export default function AuditLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-32 bg-gray-200 rounded" />
      <div className="flex gap-3">
        <div className="h-9 w-48 bg-gray-200 rounded" />
        <div className="h-9 w-32 bg-gray-200 rounded" />
      </div>
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="h-11 bg-gray-100 border-b" />
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-12 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-3 w-48 bg-gray-200 rounded" />
            <div className="h-3 w-24 bg-gray-200 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
