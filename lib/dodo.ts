import DodoPayments from 'dodopayments';

let _dodo: DodoPayments | null = null;

export function getDodo(): DodoPayments {
  if (!_dodo) {
    _dodo = new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY,
      environment: process.env.DODO_PAYMENTS_MODE === 'live' ? 'live_mode' : 'test_mode',
    });
  }
  return _dodo;
}

// For backward compatibility, but prefer using getDodo()
export const dodo = {
  get checkoutSessions() { return getDodo().checkoutSessions; },
  get customers() { return getDodo().customers; },
  get payments() { return getDodo().payments; },
  get webhooks() { return getDodo().webhooks; },
};

