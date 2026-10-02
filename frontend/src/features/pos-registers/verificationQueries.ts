import type { QueryClient } from "@tanstack/react-query";

export const verificationQueryPrefix = ["pos-verification"] as const;

export function invalidateVerificationQueries(client: QueryClient) {
  return client.invalidateQueries({ queryKey: verificationQueryPrefix });
}
