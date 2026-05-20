
export function LiteSkeletonCard() {
  return (
    <div className="animate-pulse rounded-[2rem] border bg-white p-5 shadow-sm">
      <div className="h-4 w-28 rounded bg-slate-200" />
      <div className="mt-4 h-8 w-40 rounded bg-slate-200" />
      <div className="mt-5 space-y-2">
        <div className="h-3 rounded bg-slate-100" />
        <div className="h-3 rounded bg-slate-100" />
        <div className="h-3 w-2/3 rounded bg-slate-100" />
      </div>
    </div>
  )
}
