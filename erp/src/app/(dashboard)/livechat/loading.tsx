export default function LiveChatLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] animate-pulse">
      <div className="w-80 border-r flex flex-col">
        <div className="h-14 border-b px-4 flex items-center">
          <div className="h-5 w-24 bg-muted rounded" />
        </div>
        <div className="flex-1 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 border-b px-4 flex items-center gap-3">
              <div className="h-8 w-8 bg-muted rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-3 w-40 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading conversations…</div>
      </div>
    </div>
  );
}
