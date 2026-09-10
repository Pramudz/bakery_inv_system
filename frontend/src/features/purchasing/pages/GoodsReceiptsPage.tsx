import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { purchasingApi } from "../api/purchasingApi";

function statusLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function GoodsReceiptsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [urlParams, setUrlParams] = useSearchParams();
  const client = useQueryClient();
  const { permissions, tenant, tenantUser } = useAuth();
  const [search, setSearch] = useState(() => urlParams.get("search") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => urlParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => urlParams.get("status") ?? "");
  const [typeFilter, setTypeFilter] = useState(() => urlParams.get("receiptType") ?? "");
  const [page, setPage] = useState(() => Math.max(1, Number(urlParams.get("page") || 1)));
  const [limit, setLimit] = useState(() => [20, 50, 100].includes(Number(urlParams.get("limit"))) ? Number(urlParams.get("limit")) : 20);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set("page", String(page));
    next.set("limit", String(limit));
    if (debouncedSearch) next.set("search", debouncedSearch);
    if (statusFilter) next.set("status", statusFilter);
    if (typeFilter) next.set("receiptType", typeFilter);
    setUrlParams(next, { replace: true });
  }, [debouncedSearch, limit, page, setUrlParams, statusFilter, typeFilter]);

  const receipts = useQuery({
    queryKey: [
      "goods-receipts",
      page,
      limit,
      debouncedSearch,
      statusFilter,
      typeFilter,
    ],
    queryFn: () =>
      purchasingApi.pageReceipts({
        page,
        limit,
        search: debouncedSearch,
        status: statusFilter,
        receiptType: typeFilter,
      }),
  });

  const cancel = useMutation({
    mutationFn: purchasingApi.cancelReceipt,
    onSuccess: async (_, id) => {
      if (tenant?.tenantId && tenantUser?.userId) {
        sessionStorage.removeItem(
          `grn-form-draft:${tenant.tenantId}:${tenantUser.userId}:edit:${id}`,
        );
      }
      await client.invalidateQueries({ queryKey: ["goods-receipts"] });
    },
  });

  const rows = receipts.data?.items ?? [];
  const total = receipts.data?.total ?? 0;
  const totalPages = receipts.data?.totalPages ?? 1;
  const returnTo = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (receipts.data && page > receipts.data.totalPages)
      setPage(receipts.data.totalPages);
  }, [page, receipts.data]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">PURCHASING</div>
          <h1>Goods Receipts</h1>
          <p>Receive PO-based or direct supplier deliveries.</p>
        </div>
        {permissions.includes("GRN_CREATE") && (
          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/goods-receipts/po/new", { state: { returnTo } })}
            >
              Create PO-based GRN
            </button>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/goods-receipts/direct/new", { state: { returnTo } })}
            >
              Create Direct GRN
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="toolbar grn-list-toolbar">
          <input
            className="control"
            type="search"
            value={search}
            placeholder="Search GRN number, supplier, invoice or PO number"
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="control"
            value={statusFilter}
            aria-label="Status"
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            className="control"
            value={typeFilter}
            aria-label="Receipt type"
            onChange={(event) => {
              setTypeFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Types</option>
            <option value="DIRECT">Direct</option>
            <option value="PO_BASED">PO-Based</option>
          </select>
          <button className="btn btn-secondary" onClick={() => receipts.refetch()}>
            Refresh
          </button>
        </div>

        {receipts.isError && (
          <div className="error-box">{(receipts.error as Error).message}</div>
        )}
        {cancel.error && (
          <div className="error-box">{(cancel.error as Error).message}</div>
        )}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>Type</th>
                <th>Supplier</th>
                <th>Location</th>
                <th>PO</th>
                <th>Invoice</th>
                <th>Receipt Date</th>
                <th>Status</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.isLoading ? (
                <tr>
                  <td colSpan={10} className="empty">Loading goods receipts…</td>
                </tr>
              ) : !rows.length ? (
                <tr>
                  <td colSpan={10} className="empty">No goods receipts found.</td>
                </tr>
              ) : (
                rows.map((receipt) => (
                  <tr key={receipt.goodsReceiptId}>
                    <td>{receipt.grnNumber || "Draft"}</td>
                    <td>{receipt.receiptType === "PO_BASED" ? "PO-Based" : "Direct"}</td>
                    <td>{receipt.supplier ? `${receipt.supplier.supplierCode} — ${receipt.supplier.supplierName}` : "Unavailable supplier"}</td>
                    <td>{receipt.location ? `${receipt.location.code} — ${receipt.location.name}` : "Unavailable location"}</td>
                    <td>{receipt.purchaseOrder?.poNumber || "—"}</td>
                    <td>{receipt.supplierInvoiceNumber || "—"}</td>
                    <td>{receipt.receiptDate}</td>
                    <td>
                      <span className={`status ${receipt.status === "POSTED" ? "status-on" : receipt.status === "CANCELLED" ? "status-off" : "status-warn"}`}>
                        <i /> {statusLabel(receipt.status)}
                      </span>
                    </td>
                    <td>{receipt.currencyCode || "LKR"} {Number(receipt.total || 0).toFixed(2)}</td>
                    <td className="actions">
                      <button className="btn btn-ghost" onClick={() => navigate(`/goods-receipts/${receipt.goodsReceiptId}/view`, { state: { returnTo } })}>View</button>
                      {receipt.status === "DRAFT" && permissions.includes("GRN_UPDATE") && (
                        <button className="btn btn-ghost" onClick={() => navigate(`/goods-receipts/${receipt.goodsReceiptId}/edit`, { state: { returnTo } })}>Edit</button>
                      )}
                      {receipt.status === "DRAFT" && permissions.includes("GRN_CANCEL") && (
                        <button className="btn btn-danger-soft" disabled={cancel.isPending} onClick={() => window.confirm("Cancel this draft GRN?") && cancel.mutate(Number(receipt.goodsReceiptId))}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="toolbar grn-list-pagination">
          <span>
            Showing {total ? (page - 1) * limit + 1 : 0}–{Math.min(page * limit, total)} of {total} goods receipts
          </span>
          <div>
            <button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>{" "}
            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1)
              .map((number, index, visible) => (
                <span key={number}>
                  {index > 0 && number - visible[index - 1] > 1 ? " … " : " "}
                  <button className={number === page ? "btn btn-primary" : "btn btn-secondary"} onClick={() => setPage(number)}>{number}</button>
                </span>
              ))}{" "}
            <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>{" "}
            <select
              className="control"
              value={limit}
              aria-label="Results per page"
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
