import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { paymentMethodsApi } from "../../sales/api/paymentMethodsApi";
import { posRegistersApi } from "../api/posRegistersApi";
import { PosPagination, PosSearch, useDebouncedValue } from "../components/PosListControls";
import { invalidateVerificationQueries } from "../verificationQueries";
import { ApiError } from "../../../services/apiClient";
import { clearMasterPayoutIntent, readMasterPayoutIntent, saveMasterPayoutIntent } from "../masterPayoutRecovery";
import type { MasterPayoutIntent } from "../masterPayoutRecovery";

const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PosMasterClosingPage({ embedded = false, selectedLocationId }: { embedded?: boolean; selectedLocationId?: number }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const locations = useQuery({ queryKey: ["pos-master-closing", "locations"], queryFn: posRegistersApi.masterClosingLocations });
  const [locationId, setLocationId] = useState(0);
  const [countedCash, setCountedCash] = useState("");
  const [masterIdentity, setMasterIdentity] = useState("");
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("ALL");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState<20 | 50 | 100>(20);
  const debouncedHistorySearch = useDebouncedValue(historySearch);
  const canPayout = auth.role?.code === "TENANT_ADMIN" || auth.permissions.includes("SALES_REGISTER_PAYOUT");
  const methods = useQuery({ queryKey: ["payment-methods", "master-payout"], queryFn: paymentMethodsApi.list, enabled: canPayout });
  const summary = useQuery({ queryKey: ["pos-master-closing", "summary", locationId], queryFn: () => posRegistersApi.masterClosingSummary(locationId), enabled: locationId > 0, retry: false });
  const history = useQuery({ queryKey: ["pos-master-closing", "history", locationId, historyPage, historyLimit, debouncedHistorySearch, historyStatus], queryFn: () => posRegistersApi.masterClosingHistory(locationId, { page: historyPage, limit: historyLimit, search: debouncedHistorySearch, status: historyStatus }), enabled: locationId > 0 });
  useEffect(() => {
    if (selectedLocationId) setLocationId(selectedLocationId);
    else if (!locationId && locations.data?.length) setLocationId(locations.data[0].locationId);
  }, [locationId, locations.data, selectedLocationId]);
  useEffect(() => setHistoryPage(1), [locationId, debouncedHistorySearch, historyStatus]);

  const submit = useMutation({
    mutationFn: () => posRegistersApi.submitMasterRegisterCount({ locationId, posRegisterSessionId: summary.data!.posRegisterSessionId, submissionKey, countedCash: Number(countedCash), masterCashierIdentity: masterIdentity.trim() }),
    onSuccess: () => { setCountedCash(""); setMasterIdentity(""); setSubmissionKey(crypto.randomUUID()); void queryClient.invalidateQueries({ queryKey: ["pos-master-closing"] }); void invalidateVerificationQueries(queryClient); },
  });
  const [payoutType, setPayoutType] = useState<"REFUND" | "REVERSAL">("REFUND");
  const [sourceId, setSourceId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [payoutReason, setPayoutReason] = useState("");
  const [payerIdentity, setPayerIdentity] = useState("");
  const [unresolvedPayout, setUnresolvedPayout] = useState<MasterPayoutIntent | null>(null);
  const [payoutRecoveryMessage, setPayoutRecoveryMessage] = useState("");
  const [payoutRecoveryBlocked, setPayoutRecoveryBlocked] = useState(false);
  const verifyPayout = async (intent: MasterPayoutIntent) => {
    try {
      const result = await posRegistersApi.masterPayoutOutcome(intent.payload.payoutKey);
      clearMasterPayoutIntent(localStorage, intent);
      setUnresolvedPayout(null);
      setPayoutRecoveryMessage(`Previously posted payout #${result.posCashMovementId} verified. Amount LKR ${money(result.amount)}.`);
      void summary.refetch();
    } catch (error) {
      setUnresolvedPayout(intent);
      setPayoutRecoveryMessage(error instanceof ApiError && error.status === 404
        ? "Payout is not yet confirmed. A request may still be processing. Retry the saved request with its original UUID."
        : "Payout status is uncertain. Do not start another payout; verify status or retry the saved request.");
    }
  };
  useEffect(() => {
    if (!auth.tenant?.tenantId || !auth.tenantUser?.userId) return;
    try {
      const saved = readMasterPayoutIntent(localStorage, auth.tenant.tenantId, auth.tenantUser.userId);
      setUnresolvedPayout(saved);
      setPayoutRecoveryBlocked(false);
      if (saved) { setPayoutRecoveryMessage("Checking a previously submitted master payout."); void verifyPayout(saved); }
    } catch (error) {
      setPayoutRecoveryBlocked(true);
      setPayoutRecoveryMessage((error as Error).message);
    }
  }, [auth.tenant?.tenantId, auth.tenantUser?.userId]);
  const payout = useMutation({
    mutationFn: (intent: MasterPayoutIntent) => {
      const { paymentMethodId, ...base } = intent.payload;
      return intent.kind === "REFUND"
        ? posRegistersApi.recordMasterRefundPayout(intent.sourceId, { ...base, paymentMethodId: Number(paymentMethodId) })
        : posRegistersApi.recordMasterReversalPayout(intent.sourceId, base);
    },
    onSuccess: (_result, intent) => { clearMasterPayoutIntent(localStorage, intent); setUnresolvedPayout(null); setPayoutRecoveryMessage(`Master-funded payout ${intent.payload.payoutKey} recorded.`); setSourceId(""); setPayoutAmount(""); setPayoutReason(""); setPayerIdentity(""); void summary.refetch(); },
    onError: (_error, intent) => { setUnresolvedPayout(intent); setPayoutRecoveryMessage("Payout status is being verified. Do not submit another payout until verification is complete."); void verifyPayout(intent); },
  });
  const sendPayout = (event: FormEvent) => {
    event.preventDefault();
    if (payout.isPending || payoutRecoveryBlocked || !auth.tenant?.tenantId || !auth.tenantUser?.userId || !summary.data) return;
    try {
      const prior = readMasterPayoutIntent(localStorage, auth.tenant.tenantId, auth.tenantUser.userId);
      if (prior) { setUnresolvedPayout(prior); setPayoutRecoveryMessage("Resolve the saved payout before starting another."); return; }
      const intent: MasterPayoutIntent = {
        version: 1, tenantId: String(auth.tenant.tenantId), userId: String(auth.tenantUser.userId), kind: payoutType,
        sourceId: Number(sourceId), createdAt: new Date().toISOString(),
        payload: { payoutKey: crypto.randomUUID(), locationId, posRegisterSessionId: summary.data.posRegisterSessionId,
          ...(payoutType === "REFUND" ? { paymentMethodId: Number(paymentMethodId) } : {}), amount: Number(payoutAmount),
          reason: payoutReason.trim(), physicalPayerIdentity: payerIdentity.trim() },
      };
      saveMasterPayoutIntent(localStorage, intent);
      setUnresolvedPayout(intent);
      setPayoutRecoveryMessage("Submitting payout; its original UUID is saved for recovery.");
      payout.mutate(intent);
    } catch (error) { setPayoutRecoveryMessage((error as Error).message); }
  };
  const s = summary.data;
  const validCount = countedCash !== "" && Number.isFinite(Number(countedCash)) && Number(countedCash) >= 0 && Boolean(masterIdentity.trim());

  return <div className="register-verification-page">
    {!embedded && <div className="page-head"><div><div className="eyebrow">SALES · POS</div><h1>Master Register Closing</h1><p>Reconcile approved cashier batches against the authoritative receipt ledger, then submit the master cashier's physical count.</p></div></div>}
    {!embedded && <div className="card"><label className="field"><span>Master-register location</span><select className="control" value={locationId || ""} onChange={(event) => setLocationId(Number(event.target.value))}><option value="">Choose location</option>{(locations.data ?? []).map((location) => <option key={location.locationId} value={location.locationId}>{location.name} ({location.code})</option>)}</select></label></div>}
    {summary.isPending && locationId > 0 && <div className="card">Loading master-register summary...</div>}
    {summary.isError && <div className="error-box">{summary.error.message}</div>}
    {s && <>
      <div className="card"><div className="sales-card-head"><div><h2>Business date {s.businessDate}</h2><p>Register status: {s.registerStatus}</p></div></div>
        <div className="cash-summary-grid">
          <div><small>Opening balance</small><strong>LKR {money(s.openingBalance)}</strong></div>
          <div><small>Gross cash tender</small><strong>LKR {money(s.cashReceipts.tendered)}</strong></div>
          <div><small>Change given</small><strong>LKR {money(s.cashReceipts.change)}</strong></div>
          <div><small>Net cash receipts</small><strong>LKR {money(s.cashReceipts.net)}</strong></div>
          <div><small>All physical payouts</small><strong>LKR {money(s.movements.out)}</strong></div>
          <div><small>Batch confirmation differences</small><strong className={s.batchConfirmationDifference === 0 ? "variance-ok" : "variance-alert"}>LKR {money(s.batchConfirmationDifference)}</strong></div>
          <div className="expected"><small>System-expected master cash</small><strong>LKR {money(s.systemExpectedMasterCash)}</strong></div>
          <div className="expected"><small>Confirmed-batch cash basis</small><strong>LKR {money(s.confirmedBatchCashBasis)}</strong></div>
        </div>
        <div className="cash-detail-line">Approved batches: {s.approvedBatches.length} · direct master payouts LKR {money(s.movements.directMasterOut)} · confirmed minus system basis LKR {money(s.systemVsConfirmedBasis)}</div>
      </div>
      <div className="card"><div className="sales-card-head"><div><h2>Closing readiness</h2><p>Cashiers and source coverage must be fully resolved before counting.</p></div></div>
        {!s.blockers.length ? <div className="success-box">Ready for master count submission.</div> : <div className="error-box"><strong>Closing is blocked</strong><ul>{s.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul></div>}
        <div className="verification-money compact">{s.approvedBatches.map((batch) => <div key={batch.posCashReconciliationId}><span>Cashier session {batch.posCashierSessionId}</span><b>LKR {money(batch.confirmedContribution)}</b><small>System contribution {money(batch.expectedContribution)} · difference {money(batch.confirmationDifference)}</small></div>)}</div>
      </div>
      {canPayout && <form className="card" onSubmit={sendPayout}><div className="sales-card-head"><div><h2>Record master-funded payout</h2><p>No terminal pairing is used. The source document and open funding register are locked before posting.</p></div></div>
        <div className="form-grid"><label className="field"><span>Source type</span><select className="control" value={payoutType} onChange={(event) => { setPayoutType(event.target.value as "REFUND" | "REVERSAL"); payout.reset(); }}><option value="REFUND">Completed invoice refund</option><option value="REVERSAL">Payment reversal</option></select></label><label className="field"><span>{payoutType === "REFUND" ? "Refund ID" : "Payment reversal ID"}</span><input required className="control" type="number" min="1" value={sourceId} onChange={(event) => setSourceId(event.target.value)} /></label>{payoutType === "REFUND" && <label className="field"><span>Cash payment method</span><select required className="control" value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}><option value="">Choose cash method</option>{(methods.data ?? []).filter((method) => method.isActive && method.paymentMethodType === "CASH").map((method) => <option key={method.paymentMethodId} value={method.paymentMethodId}>{method.paymentMethodName}</option>)}</select></label>}<label className="field"><span>Actual payout</span><input required className="control" type="number" min="0.01" step="0.01" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} /></label><label className="field"><span>Physical payer identity</span><input required className="control" maxLength={150} value={payerIdentity} onChange={(event) => setPayerIdentity(event.target.value)} /></label><label className="field full"><span>Reason</span><input required className="control" maxLength={255} value={payoutReason} onChange={(event) => setPayoutReason(event.target.value)} /></label></div>
        {payoutRecoveryMessage && <div className={unresolvedPayout || payoutRecoveryBlocked ? "error-box" : "success-box"} role="status">{payoutRecoveryMessage}{unresolvedPayout && <p>Original {unresolvedPayout.kind.toLowerCase()} payout: source #{unresolvedPayout.sourceId}, LKR {money(unresolvedPayout.payload.amount)}, UUID {unresolvedPayout.payload.payoutKey}.</p>}</div>}
        {unresolvedPayout && <div className="toolbar"><button type="button" className="btn btn-secondary" disabled={payout.isPending} onClick={() => void verifyPayout(unresolvedPayout)}>Verify saved payout</button><button type="button" className="btn btn-secondary" disabled={payout.isPending || s.registerStatus !== "OPEN"} onClick={() => payout.mutate(unresolvedPayout)}>Retry original request</button></div>}
        <button className="btn btn-primary" disabled={payout.isPending || !!unresolvedPayout || payoutRecoveryBlocked || s.registerStatus !== "OPEN"}>{payout.isPending ? "Posting..." : "Post physical payout"}</button>
      </form>}
      <div className="card"><div className="sales-card-head"><div><h2>Submit physical count</h2><p>Submission freezes cashier starts, receipts, and payouts until independent approval or audited recount.</p></div></div>
        <div className="form-grid"><label className="field"><span>Master cashier identity</span><input className="control" maxLength={150} value={masterIdentity} onChange={(event) => setMasterIdentity(event.target.value)} /></label><label className="field"><span>Physical counted cash</span><input className="control" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => { setCountedCash(event.target.value); submit.reset(); }} /></label></div>
        {countedCash !== "" && <div className="verification-money"><div><span>Count vs confirmed basis</span><b>LKR {money(Number(countedCash) - s.confirmedBatchCashBasis)}</b></div><div><span>Overall count vs system expected</span><b className={Number(countedCash) === s.systemExpectedMasterCash ? "variance-ok" : "variance-alert"}>LKR {money(Number(countedCash) - s.systemExpectedMasterCash)}</b></div></div>}
        {submit.isError && <div className="error-box">{submit.error.message}</div>} {submit.isSuccess && <div className="success-box">Master count submitted for independent verification.</div>}
        <button className="btn btn-primary" disabled={submit.isPending || !s.canSubmitCount || !validCount} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting..." : "Submit master count"}</button>
      </div>
    </>}
    {locationId > 0 && <div className="card"><div className="sales-card-head"><div><h2>Master closing history</h2><p>Saved count snapshots remain readable after the register is closed.</p></div></div><div className="pos-list-tools"><PosSearch value={historySearch} onChange={setHistorySearch} placeholder="Search master cashier or register" /><select className="control" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="ALL">All statuses</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></div>
      <div className="table-scroll"><table className="table"><thead><tr><th>Business date</th><th>Attempt</th><th>Status</th><th>Master cashier</th><th className="right">System expected</th><th className="right">Counted</th><th className="right">Overall variance</th></tr></thead><tbody>
        {history.isPending ? <tr><td colSpan={7}>Loading...</td></tr> : history.isError ? <tr><td colSpan={7}><div className="error-box">{history.error.message}</div></td></tr> : !history.data?.items.length ? <tr><td colSpan={7}><div className="empty">No master counts have been submitted for this location.</div></td></tr> : history.data.items.map((row) => <tr key={row.posMasterReconciliationId}><td>{row.businessDate}</td><td>{row.attemptNumber}</td><td>{row.status}</td><td>{row.masterCashierIdentity}</td><td className="right">LKR {money(row.systemExpectedMasterCash)}</td><td className="right">LKR {money(row.countedCash)}</td><td className="right"><strong className={row.countVsSystemExpected === 0 ? "variance-ok" : "variance-alert"}>LKR {money(row.countVsSystemExpected)}</strong></td></tr>)}
      </tbody></table></div>{history.data && <PosPagination page={historyPage} limit={historyLimit} total={history.data.total} onPage={setHistoryPage} onLimit={setHistoryLimit} />}
    </div>}
  </div>;
}
