export default function DashboardLoading() {
  return (
    <div className="max-w-5xl mx-auto px-6 pt-20 pb-10 space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
          <div className="h-4 w-72 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        </div>
        <div className="h-9 w-32 rounded-full bg-[var(--dash-surface-2)] animate-pulse" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="dashboard-panel rounded-xl p-6">
          <div className="h-4 w-28 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
          <div className="mt-4 h-8 w-20 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        </div>
        <div className="dashboard-panel rounded-xl p-6">
          <div className="h-4 w-28 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
          <div className="mt-4 h-8 w-20 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        </div>
      </div>

      <div className="dashboard-panel rounded-xl p-6">
        <div className="h-5 w-48 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-10 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
