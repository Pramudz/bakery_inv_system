import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateVerificationQueries, verificationQueryPrefix } from "./verificationQueries.ts";

test("a verification decision invalidates All and every type-filtered page", async () => {
  const client = new QueryClient();
  const keys = [
    [...verificationQueryPrefix, "queue", 5, "ALL", "PENDING_VERIFICATION", 1, 20, ""],
    [...verificationQueryPrefix, "queue", 5, "TERMINAL_CASH_COUNT", "PENDING_VERIFICATION", 1, 20, ""],
    [...verificationQueryPrefix, "queue", 5, "MASTER_CASH_BATCH", "APPROVED", 2, 20, "cashier"],
    [...verificationQueryPrefix, "queue", 5, "MASTER_REGISTER_COUNT", "ALL", 1, 50, ""],
  ];
  for (const key of keys) client.setQueryData(key, { items: [], total: 0 });
  client.setQueryData(["unrelated"], "preserved");
  await invalidateVerificationQueries(client);
  for (const key of keys) assert.equal(client.getQueryState(key)?.isInvalidated, true);
  assert.equal(client.getQueryState(["unrelated"])?.isInvalidated, false);
  client.clear();
});
