export default function AdminLoading() {
  return (
    <div className="max-w-5xl mx-auto px-6 pt-12 pb-10 space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="h-4 w-96 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
      </div>

      <div className="dashboard-panel rounded-xl p-6 space-y-4">
        <div className="h-5 w-40 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="h-24 rounded-lg bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="h-10 rounded-lg bg-[var(--dash-surface-2)] animate-pulse" />
      </div>

      <div className="dashboard-panel rounded-xl p-6 space-y-4">
        <div className="h-5 w-48 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-20 rounded-lg bg-[var(--dash-surface-2)] animate-pulse" />
          <div className="h-20 rounded-lg bg-[var(--dash-surface-2)] animate-pulse" />
          <div className="h-20 rounded-lg bg-[var(--dash-surface-2)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}
