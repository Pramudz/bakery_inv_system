import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import {
  inventoryConversionsApi,
  type InventoryConversion,
} from "../api/inventoryConversionsApi";
import {
  allocationMethodLabel,
  money,
  statusLabel,
} from "../inventoryConversionForm";

const statuses = ["DRAFT", "POSTED", "CANCELLED"];
const methods = ["MANUAL_PERCENT", "BY_EXISTING_WAVG", "BY_WEIGHT"];

export function InventoryConversionsPage() {
  const auth = useAuth();
  const location = useLocation();
  const client = useQueryClient();
  const storageKey = `inventory-conversion-list:${auth.tenant?.tenantId}:${auth.tenantUser?.userId}`;
  const stored = useMemo(() => {
    try {
      return window.location.search
        ? new URLSearchParams()
        : new URLSearchParams(sessionStorage.getItem(storageKey) ?? "");
    } catch {
      return new URLSearchParams();
    }
  }, [storageKey]);
  const [params, setParams] = useSearchParams(stored);
  const parsedPage = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = [20, 50, 100].includes(Number(params.get("limit")))
    ? Number(params.get("limit"))
    : 20;
  const search = params.get("search") ?? "";
  const status = statuses.includes(params.get("status") ?? "")
    ? params.get("status")!
    : "";
  const allocationMethod = methods.includes(params.get("allocationMethod") ?? "")
    ? params.get("allocationMethod")!
    : "";
  const locationId = Number(params.get("locationId")) || undefined;
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [postTarget, setPostTarget] = useState<InventoryConversion | null>(null);
  const [negativeTarget, setNegativeTarget] = useState<InventoryConversion | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InventoryConversion | null>(null);
  const [actionError, setActionError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canView = auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_VIEW");

  const locations = useQuery({
    queryKey: ["inventory-conversion-locations", auth.tenant?.tenantId, auth.tenantUser?.userId],
    queryFn: inventoryConversionsApi.locations,
    enabled: canView,
  });
  const conversions = useQuery({
    queryKey: ["inventory-conversions", "page", auth.tenant?.tenantId, auth.tenantUser?.userId, page, limit, search, status, locationId, allocationMethod, dateFrom, dateTo],
    queryFn: () => inventoryConversionsApi.page({ page, limit, search, status, locationId, allocationMethod, dateFrom, dateTo }),
    placeholderData: keepPreviousData,
    enabled: canView,
  });
  const post = useMutation({
    mutationFn: ({ conversion, confirm }: { conversion: InventoryConversion; confirm: boolean }) =>
      inventoryConversionsApi.post(Number(conversion.inventoryConversionId), { confirmNegativeStock: confirm }),
    onSuccess: async () => {
      setPostTarget(null); setNegativeTarget(null); setActionError("");
      await client.invalidateQueries({ queryKey: ["inventory-conversions"] });
    },
    onError: (failure: Error, variables) => {
      if (!variables.confirm && /negative stock/i.test(failure.message)) {
        setPostTarget(null); setNegativeTarget(variables.conversion); setActionError("");
      } else setActionError(failure.message);
    },
  });
  const cancel = useMutation({
    mutationFn: (conversion: InventoryConversion) => inventoryConversionsApi.cancel(Number(conversion.inventoryConversionId)),
    onSuccess: async () => {
      setCancelTarget(null); setActionError("");
      await client.invalidateQueries({ queryKey: ["inventory-conversions"] });
    },
    onError: (failure: Error) => setActionError(failure.message),
  });

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, params.toString()); } catch { /* URL remains authoritative. */ }
  }, [params, storageKey]);
  useEffect(() => { clearTimeout(timer.current); setSearchText(search); }, [search, location.key]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const updateParams = (patch: Record<string, string>) => setParams(current => {
    const next = new URLSearchParams(current);
    Object.entries(patch).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return next;
  }, { replace: true });
  const changeSearch = (value: string) => {
    setSearchText(value); clearTimeout(timer.current);
    timer.current = setTimeout(() => updateParams({ search: value.trim(), page: "1" }), 300);
  };
  const changeFilter = (patch: Record<string, string>) => {
    clearTimeout(timer.current);
    updateParams({ search: searchText.trim(), page: "1", ...patch });
  };
  useEffect(() => {
    if (conversions.data && !conversions.isPlaceholderData && page > conversions.data.totalPages)
      updateParams({ page: String(conversions.data.totalPages) });
  }, [conversions.data, conversions.isPlaceholderData, page]);

  if (!canView) return <div className="card empty">You do not have permission to view Inventory Conversions.</div>;
  const result = conversions.data;
  const returnTo = location.pathname + location.search;
  const start = result?.total ? (result.page - 1) * result.limit + 1 : 0;
  const end = result ? Math.min(result.page * result.limit, result.total) : 0;
  const activeLocations = (locations.data ?? []).filter(item => item.isActive && (auth.accessScope !== "LOCATION" || auth.assignedLocations.some(assigned => String(assigned.locationId) === String(item.locationId))));
  const busy = post.isPending || cancel.isPending;

  return (
    <div className="inventory-adjustments-page inventory-conversions-page">
      <div className="page-head">
        <div><div className="eyebrow">INVENTORY</div><h1>Value Adjustments / Conversions</h1><p>Transform or repack source inventory while preserving its total value.</p></div>
        {auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_CREATE") && <Link className="btn btn-primary" to="/inventory/value-adjustments/new" state={{ returnTo }}>Create Conversion</Link>}
      </div>
      <div className="card">
        <div className="conversion-list-toolbar">
          <input className="control" type="search" aria-label="Search conversion number or remarks" placeholder="Search number or remarks" value={searchText} onChange={event => changeSearch(event.target.value)} />
          <label className="field"><span>Status</span><select className="control" value={status} onChange={event => changeFilter({ status: event.target.value })}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
          <label className="field"><span>Location</span><select className="control" value={locationId ?? ""} onChange={event => changeFilter({ locationId: event.target.value })}><option value="">All locations</option>{activeLocations.map(item => <option key={item.locationId} value={item.locationId}>{item.name}</option>)}</select></label>
          <label className="field"><span>Allocation</span><select className="control" value={allocationMethod} onChange={event => changeFilter({ allocationMethod: event.target.value })}><option value="">All methods</option>{methods.map(value => <option key={value} value={value}>{allocationMethodLabel(value)}</option>)}</select></label>
          <label className="field"><span>From</span><input className="control" type="date" value={dateFrom} onChange={event => changeFilter({ dateFrom: event.target.value })} /></label>
          <label className="field"><span>To</span><input className="control" type="date" value={dateTo} onChange={event => changeFilter({ dateTo: event.target.value })} /></label>
        </div>
        <div className="table-wrap"><table className="table"><thead><tr>{["Conversion No","Date","Location","Allocation","Status","Created By","Posted By","AVAL","AVIN","Total AVAL","Total AVIN","Variance","Actions"].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>
          {conversions.isLoading ? <tr><td colSpan={13} className="empty">Loading Inventory Conversions…</td></tr> : conversions.isError ? <tr><td colSpan={13} className="empty" role="alert">{conversions.error.message} <button className="btn btn-secondary" onClick={() => void conversions.refetch()}>Retry</button></td></tr> : !result?.items.length ? <tr><td colSpan={13} className="empty">No Inventory Conversions match these filters.</td></tr> : result.items.map(row => <tr key={row.inventoryConversionId}>
            <td>{row.conversionNumber || `Draft #${row.inventoryConversionId}`}</td><td>{row.conversionDate?.slice(0,10) || "—"}</td><td>{row.location?.name ?? "—"}</td><td>{allocationMethodLabel(row.allocationMethod)}</td><td><span className="grn-status-badge">{statusLabel(row.status)}</span></td><td>{row.createdByName || "—"}</td><td>{row.postedByName || "—"}</td><td>{row.avalLineCount ?? "—"}</td><td>{row.avinLineCount ?? "—"}</td><td className="right">{row.totalInputValue != null ? `Rs ${money(row.totalInputValue)}` : "—"}</td><td className="right">{row.totalOutputValue != null ? `Rs ${money(row.totalOutputValue)}` : "—"}</td><td className={`right${Number(row.valueVariance ?? 0) !== 0 ? " error" : ""}`}>{row.valueVariance != null ? `Rs ${money(row.valueVariance)}` : "—"}</td>
            <td className="actions"><Link className="btn btn-ghost" to={`/inventory/value-adjustments/${row.inventoryConversionId}`} state={{ returnTo }}>View</Link>{row.status === "DRAFT" && auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_UPDATE") && <Link className="btn btn-ghost" to={`/inventory/value-adjustments/${row.inventoryConversionId}/edit`} state={{ returnTo }}>Edit</Link>}{row.status === "DRAFT" && auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_POST") && <button className="btn btn-primary" disabled={busy} onClick={() => { setActionError(""); setPostTarget(row); }}>Post</button>}{row.status === "DRAFT" && auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_CANCEL") && <button className="btn btn-danger-soft" disabled={busy} onClick={() => { setActionError(""); setCancelTarget(row); }}>Cancel</button>}</td>
          </tr>)}</tbody></table></div>
        <div className="po-pagination"><span aria-live="polite">{conversions.isFetching ? "Loading…" : `${start}–${end} of ${result?.total ?? 0} conversions`}</span><label>Rows per page <select className="control" value={limit} onChange={event => changeFilter({ limit: event.target.value })}>{[20,50,100].map(size => <option key={size} value={size}>{size}</option>)}</select></label><div><button className="btn btn-secondary" disabled={page <= 1 || conversions.isFetching} onClick={() => updateParams({ page: String(page - 1) })}>Previous</button><span>Page {result?.page ?? page} of {result?.totalPages ?? 1}</span><button className="btn btn-secondary" disabled={!result || page >= result.totalPages || conversions.isFetching} onClick={() => updateParams({ page: String(page + 1) })}>Next</button></div></div>
      </div>
      <Modal open={Boolean(postTarget)} title="Post this Inventory Conversion?" onClose={() => !post.isPending && setPostTarget(null)}><div className="modal-body"><p>Posting updates all AVAL and AVIN inventory atomically and makes this document read-only.</p>{actionError && <p className="error" role="alert">{actionError}</p>}</div><div className="modal-foot"><button className="btn btn-secondary" disabled={post.isPending} onClick={() => setPostTarget(null)}>Keep as draft</button><button className="btn btn-primary" disabled={post.isPending || !postTarget} onClick={() => postTarget && post.mutate({ conversion: postTarget, confirm: false })}>{post.isPending ? "Posting…" : "Post Conversion"}</button></div></Modal>
      <Modal open={Boolean(negativeTarget)} title="Negative stock confirmation" onClose={() => !post.isPending && setNegativeTarget(null)}><div className="modal-body"><p>This conversion will cause negative stock for one or more AVAL products. Do you want to continue?</p>{actionError && <p className="error" role="alert">{actionError}</p>}</div><div className="modal-foot"><button className="btn btn-secondary" disabled={post.isPending} onClick={() => setNegativeTarget(null)}>Cancel</button><button className="btn btn-danger-soft" disabled={post.isPending || !negativeTarget} onClick={() => negativeTarget && post.mutate({ conversion: negativeTarget, confirm: true })}>{post.isPending ? "Posting…" : "Post Anyway"}</button></div></Modal>
      <Modal open={Boolean(cancelTarget)} title="Cancel this draft Inventory Conversion?" onClose={() => !cancel.isPending && setCancelTarget(null)}><div className="modal-body"><p>The cancelled document remains available for audit and cannot be edited.</p>{actionError && <p className="error" role="alert">{actionError}</p>}</div><div className="modal-foot"><button className="btn btn-secondary" disabled={cancel.isPending} onClick={() => setCancelTarget(null)}>Keep draft</button><button className="btn btn-danger-soft" disabled={cancel.isPending || !cancelTarget} onClick={() => cancelTarget && cancel.mutate(cancelTarget)}>{cancel.isPending ? "Cancelling…" : "Cancel Conversion"}</button></div></Modal>
    </div>
  );
}
