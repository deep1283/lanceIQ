import { describe, expect, it } from 'vitest';
import {
  getProviderPaymentIdLabel,
  getReconciliationEventLabel,
  PROVIDER_PAYMENT_ID_FALLBACK_LABEL,
  RECONCILIATION_TWO_WAY_MESSAGE,
} from '@/app/dashboard/admin/reconciliation-ui';

describe('reconciliation UI helpers', () => {
  it('uses neutral fallback when provider_payment_id is unavailable', () => {
    expect(getProviderPaymentIdLabel(null)).toBe(PROVIDER_PAYMENT_ID_FALLBACK_LABEL);
    expect(getProviderPaymentIdLabel('')).toBe(PROVIDER_PAYMENT_ID_FALLBACK_LABEL);
    expect(getProviderPaymentIdLabel('   ')).toBe(PROVIDER_PAYMENT_ID_FALLBACK_LABEL);
    expect(getProviderPaymentIdLabel('pay_123')).toBe('pay_123');
  });

  it('maps timeline event labels including auto_resolved', () => {
    expect(getReconciliationEventLabel('auto_resolved')).toBe('Auto resolved');
    expect(getReconciliationEventLabel('replay_triggered')).toBe('Replay triggered');
    expect(getReconciliationEventLabel('resolved')).toBe('Resolved');
    expect(getReconciliationEventLabel('case_opened')).toBe('case opened');
  });

  it('keeps explicit two-way message copy stable', () => {
    expect(RECONCILIATION_TWO_WAY_MESSAGE).toBe('Downstream activation status not configured.');
  });
});
