import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import { purchasingApi, type PurchaseOrder } from "../api/purchasingApi";
import { money, poNumber, poStatuses, statusLabel } from "../purchaseOrderForm";

export function PurchaseOrdersPage() {
  const { permissions, tenant, tenantUser } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const pageValue = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = [20, 50, 100].includes(Number(params.get("limit"))) ? Number(params.get("limit")) : 20;
  const search = params.get("search") ?? "";
  const status = poStatuses.includes(params.get("status") ?? "") ? params.get("status")! : "";
  const [searchText, setSearchText] = useState(search);
  const [approvalTarget, setApprovalTarget] = useState<PurchaseOrder | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const client = useQueryClient();
  const canView = permissions.includes("PURCHASE_ORDER_VIEW");
  const orders = useQuery({
    queryKey: ["purchase-orders", "page", tenant?.tenantId, tenantUser?.userId, page, limit, search, status],
    queryFn: () => purchasingApi.pageOrders({ page, limit, search, status }),
    placeholderData: keepPreviousData, enabled: canView,
  });
  const approve = useMutation({
    mutationFn: (order: PurchaseOrder) => purchasingApi.approveOrder(Number(order.purchaseOrderId)),
    onSuccess: async () => {
      setApprovalTarget(null);
      setApprovalError("");
      await client.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (failure: Error) => setApprovalError(failure.message),
  });
  useEffect(() => { clearTimeout(searchTimer.current); setSearchText(search); }, [search, location.key]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const updateParams = (patch: Record<string, string>) => setParams(current => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(patch)) value ? next.set(key, value) : next.delete(key);
    return next;
  }, { replace: true });
  const changeSearch = (text: string) => {
    setSearchText(text); clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => updateParams({ search: text.trim(), page: "1" }), 300);
  };
  const changeFilter = (patch: Record<string, string>) => {
    clearTimeout(searchTimer.current);
    updateParams({ search: searchText.trim(), page: "1", ...patch });
  };
  useEffect(() => {
    if (orders.data && !orders.isPlaceholderData && page > orders.data.totalPages) updateParams({ page: String(orders.data.totalPages) });
  }, [orders.data, orders.isPlaceholderData, page]);

  if (!canView) return <div className="card empty">You do not have permission to view Purchase Orders.</div>;
  const result = orders.data;
  const returnTo = location.pathname + location.search;
  const start = result?.total ? (result.page - 1) * result.limit + 1 : 0;
  const end = result ? Math.min(result.page * result.limit, result.total) : 0;
  return <div>
    <div className="page-head"><div><div className="eyebrow">PURCHASING</div><h1>Purchase Orders</h1><p>Create and track supplier purchase orders.</p></div>{permissions.includes("PURCHASE_ORDER_CREATE") && <Link className="btn btn-primary" to="/purchase-orders/new" state={{ returnTo }}>Create Purchase Order</Link>}</div>
    <div className="card">
      <div className="po-list-toolbar"><input className="control" type="search" aria-label="Search PO number, supplier or reference" placeholder="Search PO number, supplier or reference" value={searchText} onChange={event => changeSearch(event.target.value)} /><label className="field"><span>Status</span><select className="control" value={status} onChange={event => changeFilter({ status: event.target.value })}><option value="">All statuses</option>{poStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label></div>
      <div className="table-wrap"><table className="table"><thead><tr>{["PO Number", "Supplier", "Receiving Location", "Order Date", "Expected Date", "Status", "Total", "Actions"].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>
        {orders.isLoading ? <tr><td colSpan={8} className="empty">Loading Purchase Orders…</td></tr> : orders.isError ? <tr><td colSpan={8} className="empty" role="alert">{orders.error.message} <button className="btn btn-secondary" onClick={() => void orders.refetch()}>Retry</button></td></tr> : !result?.items.length ? <tr><td colSpan={8} className="empty">No Purchase Orders match these filters.</td></tr> : result.items.map(order => <tr key={order.purchaseOrderId}>
          <td>{poNumber(order.poNumber)}</td><td>{order.supplier?.supplierName ?? "Supplier unavailable"}<small className="po-list-code">{order.supplier?.supplierCode}</small></td><td>{order.location?.name ?? "Location unavailable"}</td><td>{order.orderDate?.slice(0, 10) || "—"}</td><td>{order.expectedDate?.slice(0, 10) || "—"}</td><td><span className="grn-status-badge">{statusLabel(order.status)}</span></td><td className="right">{order.currencyCode || "LKR"} {money(order.total)}</td><td className="actions"><Link className="btn btn-ghost" to={"/purchase-orders/" + order.purchaseOrderId} state={{ returnTo }}>View</Link>{order.status === "DRAFT" && permissions.includes("PURCHASE_ORDER_UPDATE") && <Link className="btn btn-ghost" to={"/purchase-orders/" + order.purchaseOrderId + "/edit"} state={{ returnTo }}>Edit</Link>}{order.status === "DRAFT" && permissions.includes("PURCHASE_ORDER_APPROVE") && <button type="button" className="btn btn-primary" disabled={approve.isPending} onClick={() => { setApprovalError(""); setApprovalTarget(order); }}>Approve</button>}</td>
        </tr>)}
      </tbody></table></div>
      <div className="po-pagination"><span aria-live="polite">{orders.isFetching ? "Loading…" : start + "–" + end + " of " + (result?.total ?? 0) + " Purchase Orders"}</span><label>Rows per page <select className="control" value={limit} onChange={event => changeFilter({ limit: event.target.value })}>{[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label><div><button className="btn btn-secondary" disabled={page <= 1 || orders.isFetching} onClick={() => changeFilter({ page: String(page - 1) })}>Previous</button><span>Page {result?.page ?? page} of {result?.totalPages ?? 1}</span><button className="btn btn-secondary" disabled={!result || page >= result.totalPages || orders.isFetching} onClick={() => changeFilter({ page: String(page + 1) })}>Next</button></div></div>
    </div>
    <Modal open={Boolean(approvalTarget)} title="Approve this Purchase Order? Once approved, it cannot be edited and can be used for PO-based receiving." onClose={() => { if (!approve.isPending) setApprovalTarget(null); }}>
      <div className="modal-body">{approvalError && <p className="error" role="alert">{approvalError}</p>}</div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" disabled={approve.isPending} onClick={() => setApprovalTarget(null)}>Keep editing</button><button type="button" className="btn btn-primary" disabled={approve.isPending || !approvalTarget} onClick={() => approvalTarget && approve.mutate(approvalTarget)}>{approve.isPending ? "Approving…" : "Approve PO"}</button></div>
    </Modal>
  </div>;
}
