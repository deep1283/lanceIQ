export type IncidentWindow = {
  started_at: string;
  resolved_at: string | null;
};

export function computeUptime(params: {
  incidents: IncidentWindow[];
  windowStart: Date;
  windowEnd: Date;
}) {
  const { incidents, windowStart, windowEnd } = params;
  const windowMs = Math.max(0, windowEnd.getTime() - windowStart.getTime());
  if (windowMs === 0) {
    return { uptimePercent: 100, downtimeSeconds: 0 };
  }

  let downtimeMs = 0;
  for (const incident of incidents) {
    const start = new Date(incident.started_at).getTime();
    const end = incident.resolved_at
      ? new Date(incident.resolved_at).getTime()
      : windowEnd.getTime();
    const clampedStart = Math.max(start, windowStart.getTime());
    const clampedEnd = Math.min(end, windowEnd.getTime());
    if (clampedEnd > clampedStart) {
      downtimeMs += clampedEnd - clampedStart;
    }
  }

  const uptimePercent = Math.max(0, ((windowMs - downtimeMs) / windowMs) * 100);
  return {
    uptimePercent: Math.round(uptimePercent * 100) / 100,
    downtimeSeconds: Math.round(downtimeMs / 1000),
  };
}
