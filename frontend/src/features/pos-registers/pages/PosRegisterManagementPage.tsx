import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { posRegistersApi } from "../api/posRegistersApi";
import { PosRegistersPage } from "./PosRegistersPage";
import { PosRegisterVerificationPage } from "./PosRegisterVerificationPage";
import { PosMasterClosingPage } from "./PosMasterClosingPage";
import { PosPagination, PosSearch, useDebouncedValue } from "../components/PosListControls";
import { invalidateVerificationQueries } from "../verificationQueries";
import "./pos-register-management.css";

const tabs = [
  ["overview", "Overview"],
  ["terminals", "Terminals & Pairing"],
  ["opening", "Register Opening"],
  ["cashiers", "Cashier Sessions"],
  ["closing", "Sign-off & Closing"],
  ["verification", "Verification"],
  ["history", "History"],
] as const;
type Tab = (typeof tabs)[number][0];
const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const modeName = (mode?: string | null) => mode === "MASTER_REGISTER" ? "Master register" : mode === "TERMINAL_REGISTER" ? "Terminal register" : "Not configured";
const statusName = (status?: string | null) => status ? status.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) : "Not available";
const statusTone = (status?: string | null) => status === "ACTIVE" || status === "OPEN" || status === "APPROVED" ? "success" : status === "PENDING_VERIFICATION" || status === "RECOUNT_REQUIRED" ? "warning" : status === "REJECTED" ? "danger" : "neutral";

export function PosRegisterManagementPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab") as Tab | null;
  const tab: Tab = tabs.some(([value]) => value === requestedTab) ? requestedTab! : "overview";
  const locations = useQuery({ queryKey: ["pos-register-management", "locations"], queryFn: posRegistersApi.managementLocations });
  const requestedLocation = Number(params.get("locationId") ?? 0);
  const [locationId, setLocationId] = useState(requestedLocation);
  useEffect(() => {
    if (locationId || !locations.data?.length) return;
    const preferred = Number(auth.currentLocationId ?? 0);
    setLocationId(locations.data.some((row) => row.locationId === preferred) ? preferred : locations.data[0].locationId);
  }, [auth.currentLocationId, locationId, locations.data]);
  useEffect(() => {
    if (!locationId) return;
    const next = new URLSearchParams(params);
    next.set("locationId", String(locationId));
    next.set("tab", tab);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [locationId, tab]);
  const overview = useQuery({ queryKey: ["pos-register-management", "overview", locationId], queryFn: () => posRegistersApi.managementOverview(locationId), enabled: locationId > 0, retry: false, refetchInterval: 30000 });
  const selectedLocation = locations.data?.find((row) => row.locationId === locationId);
  const hasPermission = (permission: string) => auth.role?.code === "TENANT_ADMIN" || auth.permissions.includes(permission);
  const hasAnyPermission = (...permissions: string[]) => auth.role?.code === "TENANT_ADMIN" || permissions.some((permission) => auth.permissions.includes(permission));
  const setTab = (nextTab: Tab) => { const next = new URLSearchParams(params); next.set("tab", nextTab); if (locationId) next.set("locationId", String(locationId)); setParams(next); };
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["pos-register-management"] });
    void client.invalidateQueries({ queryKey: ["pos-register-session"] });
    void client.invalidateQueries({ queryKey: ["pos-register-closing"] });
    void client.invalidateQueries({ queryKey: ["pos-master-closing"] });
    void invalidateVerificationQueries(client);
    void client.invalidateQueries({ queryKey: ["pos-terminal-pairing"] });
  };

  return <div className="register-management-page">
    <div className="page-head register-management-head"><div><div className="eyebrow">SALES / POS</div><h1>Register Management</h1><p>Open registers, manage cashier sessions, and finish shifts.</p></div><div className="register-head-actions"><label className="location-picker"><span aria-hidden="true">⌖</span><select className="control" aria-label="Management location" value={locationId || ""} onChange={(event) => setLocationId(Number(event.target.value))}><option value="">Select location</option>{(locations.data ?? []).map((row) => <option key={row.locationId} value={row.locationId}>{row.name}</option>)}</select></label><button className="btn btn-primary" onClick={() => navigate("/billing")}>▣ Go to Billing</button></div></div>
    <nav className="register-tabs" aria-label="Register management sections">{tabs.map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}{value === "verification" && overview.data?.verificationSummary.total ? <span>{overview.data.verificationSummary.total}</span> : null}</button>)}</nav>
    {overview.isPending && locationId > 0 && <div className="card">Loading register state…</div>}
    {overview.isError && <div className="error-box">{overview.error.message}</div>}
    {overview.data && tab === "overview" && <Overview data={overview.data} mode={selectedLocation?.registerMode} go={setTab} billing={() => navigate("/billing")} canBill={hasPermission("SALES_BILLING")} />}
    {tab === "terminals" && (hasPermission("SALES_POS_REGISTER_ADMIN") ? <PosRegistersPage embedded selectedLocationId={locationId} /> : <PermissionNotice permission="SALES_POS_REGISTER_ADMIN" />)}
    {overview.data && tab === "opening" && <OpeningSection data={overview.data} locationId={locationId} canOpenMaster={hasPermission("SALES_REGISTER_OPEN")} canOperateCashier={hasPermission("SALES_BILLING")} refresh={refresh} go={setTab} />}
    {overview.data && tab === "cashiers" && <CashierSessionsSection data={overview.data} locationId={locationId} go={setTab} />}
    {overview.data && tab === "closing" && <ClosingSection data={overview.data} locationId={locationId} canCloseMaster={hasPermission("SALES_REGISTER_CLOSE")} canOperateCashier={hasPermission("SALES_BILLING")} refresh={refresh} />}
    {tab === "verification" && (hasPermission("SALES_REGISTER_VERIFY") ? <PosRegisterVerificationPage embedded selectedLocationId={locationId} /> : <PermissionNotice permission="SALES_REGISTER_VERIFY" />)}
    {tab === "history" && (hasAnyPermission("SALES_POS_REGISTER_ADMIN", "SALES_REGISTER_CLOSE", "SALES_REGISTER_VERIFY") ? <HistorySection locationId={locationId} /> : <PermissionNotice permission="SALES_POS_REGISTER_ADMIN, SALES_REGISTER_CLOSE, or SALES_REGISTER_VERIFY" />)}
  </div>;
}

function Overview({ data, mode, go, billing, canBill }: { data: any; mode?: string | null; go: (tab: Tab) => void; billing: () => void; canBill: boolean }) {
  const context = data.context;
  const currentMode = context.config?.registerMode ?? mode;
  const register = context.register ? { ...context.register, session: context.registerSession } : null;
  const currentCashier = data.cashierSessions.find((row: any) => Number(row.posCashierSessionId) === Number(context.cashierSession?.posCashierSessionId));
  const mismatch = context.terminal && Number(context.terminal.locationId) !== Number(context.location.locationId);
  return <div className="register-overview">
    <div className="register-overview-pair">
      <section className="card register-hero-card"><div className="card-kicker">THIS DEVICE</div><div className="register-hero-main"><div className="register-icon">▣</div><div><div className="register-title-line"><h2>{context.terminal?.displayName ?? "Unpaired browser"}</h2><StatusBadge status={context.pairingValid ? "PAIRED" : "UNPAIRED"} /></div><p>{context.terminal ? `${context.terminal.terminalCode} · ${context.terminal.location?.name ?? "Terminal location"}` : "No terminal credential is active in this browser."}</p>{currentCashier && <div>Cashier: <strong>{currentCashier.cashierName}</strong> <StatusBadge status={currentCashier.status} /></div>}</div></div><div className={mismatch ? "scope-note mismatch" : "scope-note"}>{mismatch ? `This device belongs to ${context.terminal.location?.name}; device actions are disabled for ${context.location.name}.` : context.blockedReason ?? "This device is ready for billing at the selected location."}</div><div className="card-actions">{context.canBill && canBill && <button className="btn btn-primary" onClick={billing}>Resume Billing</button>}{!context.pairingValid && <button className="btn btn-secondary" onClick={() => go("terminals")}>Pair this device</button>}</div></section>
      <section className="card register-hero-card"><div className="card-kicker">LOCATION REGISTER</div><div className="register-hero-main"><div className="register-icon">▤</div><div><div className="register-title-line"><h2>{register?.displayName ?? modeName(currentMode)}</h2><StatusBadge status={register?.session?.status ?? "NOT_OPEN"} /></div><dl className="register-facts"><div><dt>Mode</dt><dd>{modeName(currentMode)}</dd></div><div><dt>Business date</dt><dd>{register?.session?.businessDate ?? "—"}</dd></div><div><dt>Opening cash</dt><dd>{register?.session ? `LKR ${money(register.session.openingBalance)}` : "—"}</dd></div></dl></div></div><p>{currentMode === "MASTER_REGISTER" ? "Shared location register for all paired billing terminals." : currentMode === "TERMINAL_REGISTER" ? "Each paired terminal owns its independent register session." : "An administrator must configure this location before register operations can begin."}</p><div className="card-actions"><button className="btn btn-secondary" onClick={() => go(register?.session ? "cashiers" : "opening")}>{register?.session ? "View register" : "Opening options"}</button></div></section>
    </div>
    <section className="card"><div className="sales-card-head"><div><h2>Cashier sessions</h2><p>{data.sessionSummary.currentCashiers} current session{data.sessionSummary.currentCashiers === 1 ? "" : "s"} · {data.sessionSummary.availableTerminals} available terminal{data.sessionSummary.availableTerminals === 1 ? "" : "s"}. Showing a bounded preview.</p></div><button className="text-button" onClick={() => go("cashiers")}>View all</button></div><SessionTable rows={data.cashierSessions} go={go} terminals={data.terminals} /></section>
    <div className="register-overview-pair compact">
      <section className="card"><div className="sales-card-head"><div><h2>{currentMode === "MASTER_REGISTER" ? "Master closing" : "Closing readiness"}</h2><p>Resolve blockers before the relevant register can close.</p></div></div>{data.masterReadiness ? <><div className={`readiness-banner ${data.masterReadiness.blockers.length ? "blocked" : "ready"}`}>{data.masterReadiness.blockers.length ? "Not ready to close" : "Ready for master count"}</div>{data.masterReadiness.blockers.length ? <ul className="blocker-list">{data.masterReadiness.blockers.map((blocker: any) => <li key={blocker.code}>{blocker.message}</li>)}</ul> : <p>All cashier sessions and batches are resolved.</p>}<button className="btn btn-secondary" onClick={() => go("closing")}>View closing</button></> : <p>{currentMode === "MASTER_REGISTER" ? "Open the master register to begin location activity." : "Terminal closing is managed by the signed-in cashier on this device."}</p>}</section>
      <section className="card"><div className="sales-card-head"><div><h2>Verification queue</h2><p>Submitted counts and batches awaiting independent review.</p></div></div><div className="queue-summary"><div className="register-icon">▧</div><div><strong>{data.verificationSummary.total} submission{data.verificationSummary.total === 1 ? "" : "s"}</strong><small>{data.verificationSummary.cashierReconciliations} cashier · {data.verificationSummary.masterReconciliations} master register</small></div><button className="btn btn-primary" onClick={() => go("verification")}>Review submissions</button></div></section>
    </div>
  </div>;
}

function OpeningSection({ data, locationId, canOpenMaster, canOperateCashier, refresh, go }: { data: any; locationId: number; canOpenMaster: boolean; canOperateCashier: boolean; refresh: () => void; go: (tab: Tab) => void }) {
  const [openingBalance, setOpeningBalance] = useState("0");
  const action = data.context.action;
  const mutation = useMutation({ mutationFn: async () => {
    if (action === "OPEN_TERMINAL_REGISTER") return posRegistersApi.openTerminalRegister(Number(openingBalance));
    if (action === "OPEN_MASTER_REGISTER") return posRegistersApi.openMasterRegister(locationId, Number(openingBalance));
    if (action === "START_CASHIER_SESSION") return posRegistersApi.startCashierSession();
    throw new Error("The current state does not permit an opening action.");
  }, onSuccess: refresh });
  const needsBalance = action === "OPEN_TERMINAL_REGISTER" || action === "OPEN_MASTER_REGISTER";
  const validBalance = openingBalance !== "" && Number.isFinite(Number(openingBalance)) && Number(openingBalance) >= 0 && Math.round(Number(openingBalance) * 100) / 100 === Number(openingBalance);
  const allowed = ((action === "OPEN_TERMINAL_REGISTER" || action === "START_CASHIER_SESSION") && canOperateCashier) || (action === "OPEN_MASTER_REGISTER" && canOpenMaster);
  const label = action === "OPEN_TERMINAL_REGISTER" ? "Open register and start cashier session" : action === "OPEN_MASTER_REGISTER" ? "Open master register" : action === "START_CASHIER_SESSION" ? "Start cashier session" : data.context.canBill ? "Session already active" : "No opening action available";
  return <section className="card register-operation"><div className="sales-card-head"><div><h2>Register opening</h2><p>Opening balances are explicit and are never overwritten or carried forward.</p></div></div><div className="operation-status"><StatusBadge status={data.context.registerSession?.status ?? "NOT_OPEN"} /><strong>{data.context.blockedReason ?? "The current register and cashier session are active."}</strong></div>{needsBalance && allowed && <label className="field"><span>Opening balance (LKR)</span><input className="control" type="number" min="0" step="0.01" value={openingBalance} onChange={(event) => { setOpeningBalance(event.target.value); mutation.reset(); }} /></label>}{action === "PAIR_TERMINAL" && <button className="btn btn-secondary" onClick={() => go("terminals")}>Pair this device</button>}{action === "CONFIGURE_LOCATION" && <button className="btn btn-secondary" onClick={() => go("terminals")}>Configure location mode</button>}{action === "OPEN_MASTER_REGISTER" && !canOpenMaster && <div className="info-box">An authorized user with SALES_REGISTER_OPEN must open the master register. No terminal pairing is required.</div>}{(action === "OPEN_TERMINAL_REGISTER" || action === "START_CASHIER_SESSION") && !canOperateCashier && <div className="info-box">A signed-in cashier with SALES_BILLING must complete this device action.</div>}{allowed && <button className="btn btn-primary" disabled={mutation.isPending || (needsBalance && !validBalance)} onClick={() => { if (window.confirm(`${label} with opening balance LKR ${needsBalance ? money(openingBalance) : "0.00"}?`)) mutation.mutate(); }}>{mutation.isPending ? "Working…" : label}</button>}{mutation.isError && <div className="error-box">{mutation.error.message}</div>}</section>;
}

function CashierSessionsSection({ data, locationId, go }: { data: any; locationId: number; go: (tab: Tab) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("CURRENT");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<20 | 50 | 100>(20);
  const debouncedSearch = useDebouncedValue(search);
  const sessions = useQuery({ queryKey: ["pos-register-management", "cashier-sessions", locationId, page, limit, debouncedSearch, status], queryFn: () => posRegistersApi.cashierSessions(locationId, { page, limit, search: debouncedSearch, status }) });
  useEffect(() => setPage(1), [debouncedSearch, status, locationId]);
  const context = data.context;
  return <section className="card"><div className="sales-card-head"><div><h2>Cashier sessions</h2><p>Location-scoped sessions. Sessions cannot be reassigned or force-ended here.</p></div></div><div className="pos-list-tools"><PosSearch value={search} onChange={setSearch} placeholder="Search cashier, terminal, or register" /><select className="control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="CURRENT">Current sessions</option><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="RECOUNT_REQUIRED">Recount required</option><option value="ENDED">Ended</option></select></div><div className="table-scroll"><table className="table register-session-table"><thead><tr><th>Cashier</th><th>Location / terminal</th><th>Register</th><th>Started</th><th>Status</th><th>Next action</th></tr></thead><tbody>{sessions.isPending ? <tr><td colSpan={6}>Loading sessions…</td></tr> : sessions.isError ? <tr><td colSpan={6}><div className="error-box">{sessions.error.message}</div></td></tr> : !sessions.data?.items.length ? <tr><td colSpan={6}><div className="empty">No matching cashier sessions.</div></td></tr> : sessions.data.items.map((row: any) => { const canActHere = Number(row.id) === Number(context.cashierSession?.posCashierSessionId) && Number(row.posTerminalId) === Number(context.terminal?.posTerminalId); return <tr key={row.id}><td><strong>{row.cashierName}</strong>{Number(row.cashierUserId) === Number(context.cashierSession?.cashierUserId) && <small>{canActHere ? "This user · this device" : "This user · another device"}</small>}</td><td>{context.location.name}<small>{row.terminalName} ({row.terminalCode})</small></td><td>{row.registerName}</td><td>{new Date(row.startedAt).toLocaleString()}</td><td><StatusBadge status={row.status} /></td><td>{canActHere && row.status === "ACTIVE" ? <button className="text-button" onClick={() => go("closing")}>View summary →</button> : canActHere && row.status === "RECOUNT_REQUIRED" ? <button className="text-button" onClick={() => go("closing")}>Submit recount →</button> : row.status === "PENDING_VERIFICATION" ? <button className="text-button" onClick={() => go("verification")}>Awaiting review →</button> : statusName(row.status)}</td></tr>; })}</tbody></table></div>{sessions.data && <PosPagination page={page} limit={limit} total={sessions.data.total} onPage={setPage} onLimit={setLimit} />}</section>;
}

function SessionTable({ rows, terminals, go, detailed = false }: { rows: any[]; terminals: any[]; go: (tab: Tab) => void; detailed?: boolean }) {
  const available = terminals.filter((terminal) => terminal.available);
  return <div className="table-scroll"><table className="table register-session-table"><thead><tr><th>Cashier</th><th>Terminal</th>{detailed && <th>Register</th>}<th>Started</th><th>Status</th><th>Next action</th></tr></thead><tbody>{rows.map((row) => {
    const canActHere = row.isCurrentUser && row.isCurrentDevice;
    return <tr key={row.posCashierSessionId}><td><strong>{row.cashierName}</strong>{row.isCurrentUser && <small>{row.isCurrentDevice ? "This signed-in user · this device" : "This signed-in user · another device"}</small>}</td><td>{row.terminal.displayName}<small>{row.terminal.terminalCode}</small></td>{detailed && <td>{row.registerName}</td>}<td>{new Date(row.startedAt).toLocaleString()}</td><td><StatusBadge status={row.status} /></td><td>{canActHere && row.status === "ACTIVE" ? <button className="text-button" onClick={() => go("closing")}>View summary →</button> : row.status === "PENDING_VERIFICATION" ? <button className="text-button" onClick={() => go("verification")}>Awaiting review →</button> : row.status === "RECOUNT_REQUIRED" && canActHere ? <button className="text-button" onClick={() => go("closing")}>Submit recount →</button> : statusName(row.nextAction)}</td></tr>;
  })}{available.map((terminal) => <tr key={`available-${terminal.posTerminalId}`}><td>—</td><td>{terminal.displayName}<small>{terminal.terminalCode}</small></td>{detailed && <td>—</td>}<td>—</td><td><StatusBadge status="AVAILABLE" /></td><td>Waiting for cashier</td></tr>)}{!rows.length && !available.length && <tr><td colSpan={detailed ? 6 : 5}><div className="empty">No current cashier sessions or available active terminals.</div></td></tr>}</tbody></table></div>;
}

function ClosingSection({ data, locationId, canCloseMaster, canOperateCashier, refresh }: { data: any; locationId: number; canCloseMaster: boolean; canOperateCashier: boolean; refresh: () => void }) {
  const context = data.context;
  const [countedCash, setCountedCash] = useState("");
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const canSubmitOwn = context.cashierSession?.status === "ACTIVE" || context.cashierSession?.status === "RECOUNT_REQUIRED";
  const summary = useQuery({ queryKey: ["pos-register-closing", "current-summary", context.cashierSession?.posCashierSessionId], queryFn: posRegistersApi.currentCashSummary, enabled: canSubmitOwn && canOperateCashier, retry: false });
  const submit = useMutation({ mutationFn: () => context.config?.registerMode === "MASTER_REGISTER" ? posRegistersApi.submitMasterCashBatch(submissionKey) : posRegistersApi.submitCashCount(Number(countedCash), submissionKey), onSuccess: () => { setCountedCash(""); setSubmissionKey(crypto.randomUUID()); refresh(); } });
  return <div className="closing-workspace">
    <section className="card"><div className="sales-card-head"><div><h2>Cashier sign-off</h2><p>{context.config?.registerMode === "MASTER_REGISTER" ? "Submit the automatically tracked batch for independent master-cash confirmation." : "Count the terminal drawer and submit it for independent verification."}</p></div></div>{!canOperateCashier ? <PermissionNotice permission="SALES_BILLING" /> : !canSubmitOwn ? <div className="info-box">{context.blockedReason ?? "There is no active or recount cashier session for this signed-in user and device."}</div> : summary.isPending ? <p>Calculating the immutable shift summary…</p> : summary.isError ? <div className="error-box">{summary.error.message}</div> : summary.data && <><div className="cash-summary-grid"><div><small>Cash sales</small><strong>LKR {money(summary.data.cash.sales.net)}</strong></div><div><small>Later collections</small><strong>LKR {money(summary.data.cash.collections.net)}</strong></div><div><small>Change</small><strong>LKR {money(summary.data.cash.received.change)}</strong></div><div><small>Cash paid out</small><strong>LKR {money(summary.data.cash.paidOut)}</strong></div><div className="expected"><small>{context.config?.registerMode === "MASTER_REGISTER" ? "Unconfirmed master cash" : "Expected cash"}</small><strong>LKR {money(summary.data.expectedCash)}</strong></div></div>{context.config?.registerMode === "TERMINAL_REGISTER" && <label className="field count-field"><span>Physical counted cash</span><input className="control" type="number" min="0" step="0.01" value={countedCash} onChange={(event) => { setCountedCash(event.target.value); submit.reset(); }} /></label>}<button className="btn btn-primary" disabled={submit.isPending || (context.config?.registerMode === "TERMINAL_REGISTER" && (countedCash === "" || Number(countedCash) < 0))} onClick={() => submit.mutate()}>{submit.isPending ? "Submitting…" : context.config?.registerMode === "MASTER_REGISTER" ? "Submit batch and sign off" : context.cashierSession?.status === "RECOUNT_REQUIRED" ? "Submit audited recount" : "Submit count and sign off"}</button>{submit.isError && <div className="error-box">{submit.error.message}</div>}</>}</section>
    {context.config?.registerMode === "MASTER_REGISTER" && (canCloseMaster ? <PosMasterClosingPage embedded selectedLocationId={locationId} /> : <PermissionNotice permission="SALES_REGISTER_CLOSE" />)}
  </div>;
}

function HistorySection({ locationId }: { locationId: number }) {
  const [kind, setKind] = useState("REGISTERS");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<20 | 50 | 100>(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [mode, setMode] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const history = useQuery({ queryKey: ["pos-register-management", "history", locationId, kind, page, limit, debouncedSearch, status, mode, dateFrom, dateTo], queryFn: () => posRegistersApi.managementHistory(locationId, kind, { page, limit, search: debouncedSearch, status, mode, dateFrom, dateTo }), enabled: locationId > 0 });
  useEffect(() => setPage(1), [locationId, kind, debouncedSearch, status, mode, dateFrom, dateTo]);
  const reconciliation = kind === "CASHIER_RECONCILIATIONS" || kind === "MASTER_RECONCILIATIONS";
  const columns = useMemo(() => kind === "REGISTERS" ? ["Register", "Business date", "Opening", "Status", "Opened", "Closed"] : kind === "CASHIERS" ? ["Cashier", "Location / terminal", "Register", "Status", "Started", "Ended"] : reconciliation ? ["Type", "Cashier / master", "Attempt", "Status", "Expected", "Variance"] : ["Type", "Funding", "Source", "Amount", "Payer", "Time"], [kind, reconciliation]);
  return <section className="card"><div className="sales-card-head"><div><h2>Register history</h2><p>Location-scoped audit records. Reconciliations use their stored closing snapshots.</p></div><select className="control history-filter" value={kind} onChange={(event) => setKind(event.target.value)}><option value="REGISTERS">Register sessions</option><option value="CASHIERS">Cashier sessions</option><option value="CASHIER_RECONCILIATIONS">Cashier reconciliations</option><option value="MASTER_RECONCILIATIONS">Master reconciliations</option><option value="PAYOUTS">Payouts</option></select></div><div className="pos-list-tools history-tools"><PosSearch value={search} onChange={setSearch} placeholder="Search references, users, terminals, or registers" /><select className="control" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{kind === "REGISTERS" ? <><option value="OPEN">Open</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="RECOUNT_REQUIRED">Recount required</option><option value="CLOSED">Closed</option></> : kind === "CASHIERS" ? <><option value="ACTIVE">Active</option><option value="PENDING_VERIFICATION">Pending verification</option><option value="RECOUNT_REQUIRED">Recount required</option><option value="ENDED">Ended</option></> : reconciliation ? <><option value="PENDING_VERIFICATION">Pending verification</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></> : <><option value="CASHIER_SESSION">Cashier funded</option><option value="MASTER_REGISTER">Master funded</option></>}</select>{(kind === "REGISTERS" || kind === "CASHIERS" || kind === "CASHIER_RECONCILIATIONS") && <select className="control" value={mode} onChange={(event) => setMode(event.target.value)}><option value="ALL">All modes</option><option value="TERMINAL_REGISTER">Terminal register</option><option value="MASTER_REGISTER">Master register</option></select>}<label className="field compact-field"><span>From</span><input className="control" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="field compact-field"><span>To</span><input className="control" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></div><div className="table-scroll"><table className="table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{history.isPending ? <tr><td colSpan={6}>Loading history…</td></tr> : history.isError ? <tr><td colSpan={6}><div className="error-box">{history.error.message}</div></td></tr> : !(history.data?.items.length) ? <tr><td colSpan={6}><div className="empty">No matching history.</div></td></tr> : history.data.items.map((row: any) => <HistoryRow key={`${kind}-${row.id}`} kind={kind} row={row} />)}</tbody></table></div>{history.data && <PosPagination page={page} limit={limit} total={history.data.total} onPage={setPage} onLimit={setLimit} />}</section>;
}

function HistoryRow({ kind, row }: { kind: string; row: any }) {
  if (kind === "REGISTERS") return <tr><td>{row.registerName}<small>{row.terminalCode ? `${row.terminalName} (${row.terminalCode})` : "Location master register"}</small></td><td>{row.businessDate}</td><td>LKR {money(row.openingBalance)}</td><td><StatusBadge status={row.status} /></td><td>{new Date(row.startedAt).toLocaleString()}</td><td>{row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"}</td></tr>;
  if (kind === "CASHIERS") return <tr><td>{row.cashierName}</td><td>{row.terminalName}<small>{row.terminalCode}</small></td><td>{row.registerName}</td><td><StatusBadge status={row.status} /></td><td>{new Date(row.startedAt).toLocaleString()}</td><td>{row.endedAt ? new Date(row.endedAt).toLocaleString() : "—"}</td></tr>;
  if (kind === "CASHIER_RECONCILIATIONS" || kind === "MASTER_RECONCILIATIONS") return <tr><td>{statusName(row.kind)}</td><td>{row.cashierName ?? row.submittedBy}<small>{row.terminalName}</small></td><td>{row.attemptNumber}</td><td><StatusBadge status={row.status} /></td><td>LKR {money(row.expectedCash)}</td><td className={Number(row.variance) === 0 ? "variance-ok" : "variance-alert"}>LKR {money(row.variance)}</td></tr>;
  return <tr><td>{statusName(row.movementType)}</td><td>{statusName(row.status)}{row.terminalCode && <small>{row.terminalName} ({row.terminalCode})</small>}</td><td>{row.sourceType} #{row.sourceId}</td><td>LKR {money(row.amount)}</td><td>{row.physicalPayerIdentity ?? row.cashierName ?? "—"}</td><td>{new Date(row.occurredAt).toLocaleString()}</td></tr>;
}

function StatusBadge({ status }: { status?: string | null }) { return <span className={`register-status ${statusTone(status)}`}><i />{statusName(status)}</span>; }
function PermissionNotice({ permission }: { permission: string }) { return <div className="card info-box">This section requires <strong>{permission}</strong>. An authorized user can complete it without terminal pairing.</div>; }
