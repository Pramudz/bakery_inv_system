import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CashReconciliation, PosVerificationType, posRegistersApi } from "../api/posRegistersApi";
import { PosPagination, PosSearch, useDebouncedValue } from "../components/PosListControls";
import { invalidateVerificationQueries, verificationQueryPrefix } from "../verificationQueries";
import "./pos-register-verification.css";

const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PosRegisterVerificationPage({ embedded = false, selectedLocationId }: { embedded?: boolean; selectedLocationId?: number }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [verifiedCount, setVerifiedCount] = useState("");
  const [confirmedNet, setConfirmedNet] = useState("");
  const [recipientIdentity, setRecipientIdentity] = useState("");
  const [verificationReason, setVerificationReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [verificationKey, setVerificationKey] = useState(() => crypto.randomUUID());
  const [selectedMasterId, setSelectedMasterId] = useState<number | null>(null);
  const [masterVerifiedCount, setMasterVerifiedCount] = useState("");
  const [masterRejectionReason, setMasterRejectionReason] = useState("");
  const [masterVerificationKey, setMasterVerificationKey] = useState(() => crypto.randomUUID());
  const [queueSearch, setQueueSearch] = useState("");
  const [queueType, setQueueType] = useState<PosVerificationType>("ALL");
  const [queueStatus, setQueueStatus] = useState("PENDING_VERIFICATION");
  const [locationFilter, setLocationFilter] = useState<number | undefined>();
  const locations = useQuery({ queryKey: ["pos-register-management", "locations"], queryFn: posRegistersApi.managementLocations, enabled: !embedded });
  const activeLocationId = selectedLocationId ?? locationFilter;
  const [queuePage, setQueuePage] = useState(1);
  const [queueLimit, setQueueLimit] = useState<20 | 50 | 100>(20);
  const debouncedQueueSearch = useDebouncedValue(queueSearch);
  const queue = useQuery({ queryKey: [...verificationQueryPrefix, "queue", activeLocationId, queueType, queueStatus, queuePage, queueLimit, debouncedQueueSearch], queryFn: () => posRegistersApi.combinedVerificationQueue({ locationId: activeLocationId, page: queuePage, limit: queueLimit, search: debouncedQueueSearch, type: queueType, status: queueStatus }) });
  const detail = useQuery({ queryKey: ["pos-register-closing", "verification", selectedId], queryFn: () => posRegistersApi.reconciliation(selectedId!), enabled: selectedId !== null });
  const masterDetail = useQuery({ queryKey: ["pos-master-closing", "verification", selectedMasterId], queryFn: () => posRegistersApi.masterReconciliation(selectedMasterId!), enabled: selectedMasterId !== null });
  const queueRows = queue.data?.items ?? [];

  useEffect(() => { setQueuePage(1); setSelectedId(null); setSelectedMasterId(null); }, [debouncedQueueSearch, queueType, queueStatus, activeLocationId]);

  useEffect(() => {
    if (!detail.data) return;
    setVerifiedCount(detail.data.countedCash?.toFixed(2) ?? "");
    setConfirmedNet(detail.data.expectedCash.toFixed(2));
  }, [detail.data]);
  useEffect(() => { if (masterDetail.data) setMasterVerifiedCount(masterDetail.data.countedCash.toFixed(2)); }, [masterDetail.data]);

  const decision = useMutation({
    mutationFn: (choice: "APPROVE" | "REJECT") => {
      const isMaster = detail.data?.reconciliationType === "MASTER_CASH_BATCH";
      return posRegistersApi.decideReconciliation(selectedId!, {
        verificationKey,
        decision: choice,
        verifiedCountedCash: !isMaster ? Number(verifiedCount) : undefined,
        confirmedNetCash: isMaster && choice === "APPROVE" ? Number(confirmedNet) : undefined,
        physicalRecipientIdentity: isMaster && choice === "APPROVE" ? recipientIdentity.trim() : undefined,
        verificationReason: isMaster && choice === "APPROVE" ? verificationReason.trim() : undefined,
        rejectionReason: choice === "REJECT" ? rejectionReason.trim() : undefined,
      });
    },
    onSuccess: () => {
      setSelectedId(null);
      setVerifiedCount("");
      setConfirmedNet("");
      setRecipientIdentity("");
      setVerificationReason("");
      setRejectionReason("");
      setVerificationKey(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ["pos-register-closing"] });
      void invalidateVerificationQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["pos-register-management"] });
    },
  });

  const row: CashReconciliation | undefined = detail.data;
  const validCount = verifiedCount !== "" && Number.isFinite(Number(verifiedCount)) && Number(verifiedCount) >= 0;
  const validConfirmation = confirmedNet !== "" && Number.isFinite(Number(confirmedNet)) && Number(confirmedNet) >= 0 && Boolean(recipientIdentity.trim()) && Boolean(verificationReason.trim());
  const validMasterCount = masterVerifiedCount !== "" && Number.isFinite(Number(masterVerifiedCount)) && Number(masterVerifiedCount) >= 0;
  const masterDecision = useMutation({
    mutationFn: (choice: "APPROVE" | "REJECT") => posRegistersApi.decideMasterReconciliation(selectedMasterId!, { verificationKey: masterVerificationKey, decision: choice, verifiedCountedCash: Number(masterVerifiedCount), rejectionReason: choice === "REJECT" ? masterRejectionReason.trim() : undefined }),
    onSuccess: () => { setSelectedMasterId(null); setMasterVerifiedCount(""); setMasterRejectionReason(""); setMasterVerificationKey(crypto.randomUUID()); void queryClient.invalidateQueries({ queryKey: ["pos-master-closing"] }); void invalidateVerificationQueries(queryClient); void queryClient.invalidateQueries({ queryKey: ["pos-register-management"] }); },
  });
  const selectMaster = (id: number) => { setSelectedId(null); setSelectedMasterId(id); setMasterRejectionReason(""); setMasterVerificationKey(crypto.randomUUID()); masterDecision.reset(); };
  const select = (id: number) => {
    setSelectedMasterId(null);
    setSelectedId(id);
    setRejectionReason("");
    setRecipientIdentity("");
    setVerificationReason("");
    setVerificationKey(crypto.randomUUID());
    decision.reset();
  };

  return <div className="register-verification-page">
    {!embedded && <div className="page-head"><div><div className="eyebrow">SALES · POS</div><h1>Register Verification</h1><p>Review terminal counts, master cashier batches, and final master-register counts.</p></div></div>}
    <div className="verification-layout">
      <div className="card"><div className="sales-card-head"><div><h2>Verification records</h2><p>Newest submission first. Select a record to review its stored detail.</p></div></div><div className="pos-list-tools"><PosSearch value={queueSearch} onChange={setQueueSearch} placeholder="Search location, cashier, terminal, or register" />{!embedded && <select className="control" aria-label="Verification location" value={locationFilter ?? ""} onChange={(event) => setLocationFilter(event.target.value ? Number(event.target.value) : undefined)}><option value="">All authorized locations</option>{(locations.data ?? []).map((location) => <option key={location.locationId} value={location.locationId}>{location.name}</option>)}</select>}<select className="control" aria-label="Verification type" value={queueType} onChange={(event) => setQueueType(event.target.value as PosVerificationType)}><option value="ALL">All types</option><option value="TERMINAL_CASH_COUNT">Terminal cash counts</option><option value="MASTER_CASH_BATCH">Master cashier batches</option><option value="MASTER_REGISTER_COUNT">Master register counts</option></select><select className="control" aria-label="Verification status" value={queueStatus} onChange={(event) => setQueueStatus(event.target.value)}><option value="PENDING_VERIFICATION">Pending verification</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ALL">All statuses</option></select></div>
        <table className="table"><thead><tr><th>Type / location</th><th>Cashier or master</th><th>Submitted</th><th>Status</th><th className="right">Expected</th><th className="right">Submission</th></tr></thead><tbody>
          {queue.isPending ? <tr><td colSpan={6}>Loading...</td></tr> : queue.isError ? <tr><td colSpan={6}><div className="error-box">{queue.error.message}</div></td></tr> : !queueRows.length ? <tr><td colSpan={6}>{queue.data?.total ? "Updating the selected page…" : <div className="empty">No authorized verification records match these filters.</div>}</td></tr> : queueRows.map((item) => <tr key={`${item.verificationType}:${item.sourceId}`} className={(item.verificationType === "MASTER_REGISTER_COUNT" ? selectedMasterId : selectedId) === item.sourceId ? "selected-row" : ""} onClick={() => item.verificationType === "MASTER_REGISTER_COUNT" ? selectMaster(item.sourceId) : select(item.sourceId)}><td><strong>{item.verificationType === "TERMINAL_CASH_COUNT" ? "Terminal cash count" : item.verificationType === "MASTER_CASH_BATCH" ? "Master cashier batch" : "Master register count"}</strong><small>{item.locationName}{item.terminalCode ? ` · ${item.terminalCode} · ${item.terminalName}` : ""} · attempt {item.attemptNumber}</small></td><td>{item.cashierName}</td><td>{new Date(item.submittedAt).toLocaleString()}</td><td>{item.status.toLowerCase().replaceAll("_", " ")}</td><td className="right">LKR {money(item.expectedCash)}</td><td className="right">{item.countedCash === null ? "Batch confirmation" : `LKR ${money(item.countedCash)}`}</td></tr>)}
        </tbody></table>{queue.data && <PosPagination page={queuePage} limit={queueLimit} total={queue.data.total} onPage={setQueuePage} onLimit={setQueueLimit} />}
      </div>
      {row && <aside className="card verification-detail"><div><small>{row.location?.name} · {row.cashierSession?.terminal?.terminalCode} · {row.cashierSession?.terminal?.displayName}</small><h2>{row.cashierSession?.cashierName}</h2><p>Business date {row.registerSession?.businessDate} · attempt {row.attemptNumber}</p></div>
        <div className="verification-money">
          {row.reconciliationType === "TERMINAL_CASH_COUNT" && <div><span>Opening</span><b>LKR {money(row.openingBalance)}</b></div>}
          <div><span>Cash sales</span><b>LKR {money(row.summary.cash.sales.net)}</b><small>Tendered {money(row.summary.cash.sales.tendered)} · applied {money(row.summary.cash.sales.applied)} · change {money(row.summary.cash.sales.change)}</small></div>
          <div><span>Later cash collections</span><b>LKR {money(row.summary.cash.collections.net)}</b><small>Tendered {money(row.summary.cash.collections.tendered)} · applied {money(row.summary.cash.collections.applied)} · change {money(row.summary.cash.collections.change)}</small></div>
          <div><span>Cash paid out</span><b>LKR {money(row.cashPaidOut)}</b></div>
          <div className="total"><span>{row.reconciliationType === "MASTER_CASH_BATCH" ? "Unconfirmed master cash" : "Expected cash"}</span><b>LKR {money(row.expectedCash)}</b></div>
          {row.reconciliationType === "TERMINAL_CASH_COUNT" && <><div><span>Cashier count</span><b>LKR {money(row.countedCash)}</b></div><div><span>Cashier variance</span><b className={row.cashierVariance === 0 ? "variance-ok" : "variance-alert"}>LKR {money(row.cashierVariance)}</b></div></>}
        </div>
        <details><summary>Non-cash and credit breakdown</summary><div className="verification-money compact"><div><span>Cards</span><b>{row.summary.cardsByChannel.map((x) => `${x.channel}: ${money(x.amount)}`).join(" · ") || "0.00"}</b></div><div><span>Cheques</span><b>LKR {money(row.summary.chequeTotal)}</b></div><div><span>Original credit extended</span><b>LKR {money(row.summary.creditSales.originalCreditExtended)}</b></div><div><span>Outstanding credit</span><b>LKR {money(row.summary.creditSales.outstanding)}</b></div><div><span>Refunds</span><b>LKR {money(row.summary.refunds.total)}</b></div></div></details>
        {row.reconciliationType === "MASTER_CASH_BATCH" ? <>
          <label className="field"><span>Master cashier confirmed net amount</span><input className="control" type="number" min="0" step="0.01" value={confirmedNet} onChange={(event) => { setConfirmedNet(event.target.value); decision.reset(); }} /></label>
          <div className="verified-variance">Confirmation variance: <strong>LKR {confirmedNet !== "" && Number.isFinite(Number(confirmedNet)) ? money(Number(confirmedNet) - row.expectedCash) : "—"}</strong></div>
          <label className="field"><span>Physical recipient identity</span><input className="control" maxLength={150} value={recipientIdentity} onChange={(event) => setRecipientIdentity(event.target.value)} placeholder="Name or identifier on the signed batch" /></label>
          <label className="field"><span>Confirmation reason / evidence</span><textarea className="control" maxLength={255} value={verificationReason} onChange={(event) => setVerificationReason(event.target.value)} placeholder="How the batch was independently confirmed" /></label>
        </> : <>
          <label className="field"><span>Verifier's independent cash count</span><input className="control" type="number" min="0" step="0.01" value={verifiedCount} onChange={(event) => { setVerifiedCount(event.target.value); decision.reset(); }} /></label>
          <div className="verified-variance">Verified variance: <strong>LKR {validCount ? money(Number(verifiedCount) - row.expectedCash) : "—"}</strong></div>
        </>}
        {row.status === "PENDING_VERIFICATION" ? <><label className="field"><span>Correction reason</span><textarea className="control" maxLength={255} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Required when requesting a corrected submission" /></label>
        {decision.isError && <div className="error-box">{decision.error.message}</div>}
        <div className="verification-actions"><button className="btn btn-danger-soft" disabled={decision.isPending || !rejectionReason.trim()} onClick={() => decision.mutate("REJECT")}>Reject / Request correction</button><button className="btn btn-primary" disabled={decision.isPending || (row.reconciliationType === "MASTER_CASH_BATCH" ? !validConfirmation : !validCount)} onClick={() => decision.mutate("APPROVE")}>{row.reconciliationType === "MASTER_CASH_BATCH" ? "Confirm and end cashier shift" : "Approve and close shift"}</button></div></> : <div className="empty">This submission is {row.status.toLowerCase()} and cannot be decided again.</div>}
      </aside>}
      {masterDetail.data && <aside className="card verification-detail"><div><small>{masterDetail.data.location?.name} · business date {masterDetail.data.businessDate}</small><h2>{masterDetail.data.masterCashierIdentity}</h2><p>Final master count · attempt {masterDetail.data.attemptNumber}</p></div>
        <div className="verification-money"><div><span>Opening balance</span><b>LKR {money(masterDetail.data.openingBalance)}</b></div><div><span>Batch confirmation differences</span><b className={masterDetail.data.batchConfirmationDifference === 0 ? "variance-ok" : "variance-alert"}>LKR {money(masterDetail.data.batchConfirmationDifference)}</b></div><div><span>Confirmed-batch cash basis</span><b>LKR {money(masterDetail.data.confirmedBatchCashBasis)}</b></div><div className="total"><span>System-expected master cash</span><b>LKR {money(masterDetail.data.systemExpectedMasterCash)}</b></div><div><span>Submitted physical count</span><b>LKR {money(masterDetail.data.countedCash)}</b></div><div><span>Count vs confirmed basis</span><b>LKR {money(masterDetail.data.countVsConfirmedBasis)}</b></div><div><span>Overall count vs system expected</span><b className={masterDetail.data.countVsSystemExpected === 0 ? "variance-ok" : "variance-alert"}>LKR {money(masterDetail.data.countVsSystemExpected)}</b></div></div>
        <label className="field"><span>Verifier's independent physical count</span><input className="control" type="number" min="0" step="0.01" value={masterVerifiedCount} onChange={(event) => { setMasterVerifiedCount(event.target.value); masterDecision.reset(); }} /></label>
        <div className="verified-variance">Verified vs system expected: <strong>LKR {validMasterCount ? money(Number(masterVerifiedCount) - masterDetail.data.systemExpectedMasterCash) : "—"}</strong></div>
        {masterDetail.data.status === "PENDING_VERIFICATION" ? <><label className="field"><span>Recount reason</span><textarea className="control" maxLength={255} value={masterRejectionReason} onChange={(event) => setMasterRejectionReason(event.target.value)} placeholder="Required when rejecting the count" /></label>
        {masterDecision.isError && <div className="error-box">{masterDecision.error.message}</div>}
        <div className="verification-actions"><button className="btn btn-danger-soft" disabled={masterDecision.isPending || !validMasterCount || !masterRejectionReason.trim()} onClick={() => masterDecision.mutate("REJECT")}>Reject / Request recount</button><button className="btn btn-primary" disabled={masterDecision.isPending || !validMasterCount} onClick={() => masterDecision.mutate("APPROVE")}>Approve and close master register</button></div></> : <div className="empty">This submission is {masterDetail.data.status.toLowerCase()} and cannot be decided again.</div>}
      </aside>}
    </div>
  </div>;
}
