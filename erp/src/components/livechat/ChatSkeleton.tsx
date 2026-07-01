export function ChatSkeleton() {
  const bubbles: Array<{ isAgent: boolean; width: string }> = [
    { isAgent: false, width: 'w-48' },
    { isAgent: true,  width: 'w-44' },
    { isAgent: false, width: 'w-56' },
    { isAgent: false, width: 'w-36' },
    { isAgent: true,  width: 'w-52' },
    { isAgent: true,  width: 'w-40' },
    { isAgent: false, width: 'w-48' },
  ];

  return (
    <div className="flex-1 overflow-hidden bg-gray-50 px-4 py-4 space-y-3">
      {bubbles.map((b, i) => (
        <div key={i} className={`flex gap-2 ${b.isAgent ? 'flex-row-reverse' : 'flex-row'}`}>
          <div
            className={`h-10 rounded-2xl animate-pulse ${b.width} ${
              b.isAgent ? 'bg-blue-200 rounded-tr-none' : 'bg-gray-200 rounded-tl-none'
            }`}
          />
        </div>
      ))}
    </div>
  );
}
