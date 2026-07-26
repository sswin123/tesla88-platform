export default function TransactionsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-44 bg-gray-200 rounded" />
      <div className="flex gap-1 border-b pb-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-9 w-24 bg-gray-200 rounded-t" />
        ))}
      </div>
      <div className="rounded-lg border bg-white p-4">
        <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
        <div className="flex gap-8">
          <div className="h-10 w-16 bg-gray-200 rounded" />
          <div className="h-10 w-16 bg-gray-200 rounded" />
          <div className="h-10 w-16 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="rounded-md border bg-white overflow-hidden">
        <div className="h-11 bg-gray-100 border-b" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-14 border-b last:border-0 flex items-center px-4 gap-4">
            <div className="h-4 w-12 bg-gray-200 rounded" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-4 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-20 bg-gray-200 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
