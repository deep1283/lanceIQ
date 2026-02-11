export default function SettingsLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-10 pb-10 space-y-8">
      <div className="h-8 w-64 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
      <div className="dashboard-panel rounded-xl p-6 space-y-4">
        <div className="h-5 w-32 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="h-4 w-72 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
      </div>
      <div className="dashboard-panel rounded-xl p-6 space-y-4">
        <div className="h-5 w-32 rounded-md bg-[var(--dash-surface-2)] animate-pulse" />
        <div className="h-10 w-28 rounded-full bg-[var(--dash-surface-2)] animate-pulse" />
      </div>
    </div>
  );
}
