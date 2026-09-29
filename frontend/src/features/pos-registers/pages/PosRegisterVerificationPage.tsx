import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CashReconciliation, posRegistersApi } from "../api/posRegistersApi";
import "./pos-register-verification.css";

const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PosRegisterVerificationPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [verifiedCount, setVerifiedCount] = useState("");
  const [confirmedNet, setConfirmedNet] = useState("");
  const [recipientIdentity, setRecipientIdentity] = useState("");
  const [verificationReason, setVerificationReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [verificationKey, setVerificationKey] = useState(() => crypto.randomUUID());
  const queue = useQuery({ queryKey: ["pos-register-closing", "verification-queue"], queryFn: posRegistersApi.verificationQueue });
  const detail = useQuery({ queryKey: ["pos-register-closing", "verification", selectedId], queryFn: () => posRegistersApi.reconciliation(selectedId!), enabled: selectedId !== null });

  useEffect(() => {
    if (!detail.data) return;
    setVerifiedCount(detail.data.countedCash?.toFixed(2) ?? "");
    setConfirmedNet(detail.data.expectedCash.toFixed(2));
  }, [detail.data]);

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
    },
  });

  const row: CashReconciliation | undefined = detail.data;
  const validCount = verifiedCount !== "" && Number.isFinite(Number(verifiedCount)) && Number(verifiedCount) >= 0;
  const validConfirmation = confirmedNet !== "" && Number.isFinite(Number(confirmedNet)) && Number(confirmedNet) >= 0 && Boolean(recipientIdentity.trim()) && Boolean(verificationReason.trim());
  const select = (item: CashReconciliation) => {
    setSelectedId(item.posCashReconciliationId);
    setRejectionReason("");
    setRecipientIdentity("");
    setVerificationReason("");
    setVerificationKey(crypto.randomUUID());
    decision.reset();
  };

  return <div className="register-verification-page">
    <div className="page-head"><div><div className="eyebrow">SALES · POS</div><h1>Register Verification</h1><p>Review terminal cash counts and confirm master-register cashier batches.</p></div></div>
    <div className="verification-layout">
      <div className="card"><div className="sales-card-head"><div><h2>Awaiting verification</h2><p>Oldest submission first.</p></div></div>
        <table className="table"><thead><tr><th>Location / terminal</th><th>Cashier</th><th>Submitted</th><th className="right">Expected</th><th className="right">Submission</th></tr></thead><tbody>
          {queue.isPending ? <tr><td colSpan={5}>Loading...</td></tr> : queue.isError ? <tr><td colSpan={5}><div className="error-box">{queue.error.message}</div></td></tr> : !(queue.data ?? []).length ? <tr><td colSpan={5}><div className="empty">No reconciliations are waiting for verification.</div></td></tr> : queue.data!.map((item) => <tr key={item.posCashReconciliationId} className={selectedId === item.posCashReconciliationId ? "selected-row" : ""} onClick={() => select(item)}><td><strong>{item.location?.name}</strong><small className="refund-code">{item.cashierSession?.terminal?.displayName} · attempt {item.attemptNumber}</small></td><td>{item.cashierSession?.cashierName}</td><td>{new Date(item.submittedAt).toLocaleString()}</td><td className="right">LKR {money(item.expectedCash)}</td><td className="right"><strong>{item.reconciliationType === "MASTER_CASH_BATCH" ? "Master batch" : `LKR ${money(item.countedCash)}`}</strong></td></tr>)}
        </tbody></table>
      </div>
      {row && <aside className="card verification-detail"><div><small>{row.location?.name} · {row.cashierSession?.terminal?.displayName}</small><h2>{row.cashierSession?.cashierName}</h2><p>Business date {row.registerSession?.businessDate} · attempt {row.attemptNumber}</p></div>
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
        <label className="field"><span>Correction reason</span><textarea className="control" maxLength={255} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Required when requesting a corrected submission" /></label>
        {decision.isError && <div className="error-box">{decision.error.message}</div>}
        <div className="verification-actions"><button className="btn btn-danger-soft" disabled={decision.isPending || !rejectionReason.trim()} onClick={() => decision.mutate("REJECT")}>Reject / Request correction</button><button className="btn btn-primary" disabled={decision.isPending || (row.reconciliationType === "MASTER_CASH_BATCH" ? !validConfirmation : !validCount)} onClick={() => decision.mutate("APPROVE")}>{row.reconciliationType === "MASTER_CASH_BATCH" ? "Confirm and end cashier shift" : "Approve and close shift"}</button></div>
      </aside>}
    </div>
  </div>;
}
