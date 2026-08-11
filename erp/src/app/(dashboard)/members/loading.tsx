export default function MembersLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-36 bg-muted rounded" />
      <div className="flex gap-3">
        <div className="h-9 w-64 bg-muted rounded" />
        <div className="h-9 w-32 bg-muted rounded" />
      </div>
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="h-11 bg-muted border-b" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
