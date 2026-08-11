export default function TransactionsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-44 bg-muted rounded" />
      <div className="flex gap-1 border-b pb-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-24 bg-muted rounded-t" />
        ))}
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="h-4 w-32 bg-muted rounded mb-3" />
        <div className="flex gap-8">
          <div className="h-10 w-16 bg-muted rounded" />
          <div className="h-10 w-16 bg-muted rounded" />
          <div className="h-10 w-16 bg-muted rounded" />
        </div>
      </div>
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="h-11 bg-muted border-b" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-4 w-12 bg-muted rounded" />
            <div className="h-5 w-20 bg-muted rounded-full" />
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
