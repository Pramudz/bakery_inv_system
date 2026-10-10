import { ApiError } from '../../services/apiClient';

export function recoverySubmissionMessage(error: unknown, noun: 'payment' | 'refund') {
  if (!(error instanceof ApiError)) return `The ${noun} response was lost or the network failed. Transaction status is being verified. Keep the original UUID and do not start another ${noun}.`;
  if (error.status === 401 || error.status === 403) return `Authorization is required to verify this ${noun}: ${error.message}. The original UUID is preserved.`;
  if (error.status === 409) return `Transaction conflict: ${error.message}. Keep the original UUID and reconcile the saved request before another ${noun}.`;
  if (error.status === 400 || error.status === 422) return `Validation rejected: ${error.message}. The original UUID is retained until the server outcome is verified.`;
  if (error.status === 429 || error.status === 503) return `The server is busy: ${error.message}. Verify the original outcome, then retry with the same UUID.`;
  return `The ${noun} outcome is uncertain: ${error.message}. Verify the original UUID before retrying.`;
}
