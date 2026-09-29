type BillingLoyaltyAreaProps = {
  customerId?: number;
};

/**
 * Integration boundary for the future verified loyalty flow. The API currently
 * exposes no loyalty balance, OTP, or redemption contract, so the POS must not
 * render controls or manufacture a loyalty payment.
 */
export function BillingLoyaltyArea({ customerId }: BillingLoyaltyAreaProps) {
  void customerId;
  return null;
}
