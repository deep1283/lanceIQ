export type ReconciliationCaseStatus = 'open' | 'pending' | 'resolved' | 'ignored';
export type ReconciliationCaseFilter = ReconciliationCaseStatus | 'all';

export const RECONCILIATION_TWO_WAY_MESSAGE = 'Downstream activation status not configured.';
export const PROVIDER_PAYMENT_ID_FALLBACK_LABEL = 'Provider payment ID unavailable';
export const RECONCILIATION_CASE_FILTERS: ReconciliationCaseFilter[] = [
  'all',
  'open',
  'pending',
  'resolved',
  'ignored',
];

export function getProviderPaymentIdLabel(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || PROVIDER_PAYMENT_ID_FALLBACK_LABEL;
}

export function getReconciliationEventLabel(eventType: string | null | undefined) {
  if (!eventType) return 'Event';
  const normalized = eventType.trim().toLowerCase();
  if (normalized === 'auto_resolved') return 'Auto resolved';
  if (normalized === 'replay_triggered') return 'Replay triggered';
  if (normalized === 'resolved') return 'Resolved';
  return normalized.replace(/_/g, ' ');
}
