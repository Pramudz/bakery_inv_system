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
  inventoryAdjustmentsApi,
  type InventoryAdjustment,
} from "../api/inventoryAdjustmentsApi";
import { money, movementLabel, statusLabel } from "../inventoryAdjustmentForm";

const allowedStatuses = ["DRAFT", "POSTED", "CANCELLED"];
const allowedMovements = ["ADJI", "ADJO"];

export function InventoryAdjustmentsPage() {
  const auth = useAuth();
  const location = useLocation();
  const client = useQueryClient();
  const storageKey = `inventory-adjustment-list:${auth.tenant?.tenantId}:${auth.tenantUser?.userId}`;
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
  const page =
    Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const limit = [20, 50, 100].includes(Number(params.get("limit")))
    ? Number(params.get("limit"))
    : 20;
  const search = params.get("search") ?? "";
  const status = allowedStatuses.includes(params.get("status") ?? "")
    ? params.get("status")!
    : "";
  const movementType = allowedMovements.includes(
    params.get("movementType") ?? "",
  )
    ? params.get("movementType")!
    : "";
  const reasonId = Number(params.get("reasonId")) || undefined;
  const locationId = Number(params.get("locationId")) || undefined;
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const [searchText, setSearchText] = useState(search);
  const [postTarget, setPostTarget] = useState<InventoryAdjustment | null>(
    null,
  );
  const [negativeTarget, setNegativeTarget] =
    useState<InventoryAdjustment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InventoryAdjustment | null>(
    null,
  );
  const [actionError, setActionError] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const canView = auth.permissions.includes("INVENTORY_ADJUSTMENT_VIEW");
  const reasons = useQuery({
    queryKey: ["inventory-adjustment-reasons", auth.tenant?.tenantId, "all"],
    queryFn: () => inventoryAdjustmentsApi.reasons(),
    enabled: canView,
  });
  const locations = useQuery({
    queryKey: [
      "inventory-adjustment-locations",
      auth.tenant?.tenantId,
      auth.tenantUser?.userId,
    ],
    queryFn: inventoryAdjustmentsApi.locations,
    enabled: canView,
  });
  const adjustments = useQuery({
    queryKey: [
      "inventory-adjustments",
      "page",
      auth.tenant?.tenantId,
      auth.tenantUser?.userId,
      page,
      limit,
      search,
      status,
      movementType,
      reasonId,
      locationId,
      dateFrom,
      dateTo,
    ],
    queryFn: () =>
      inventoryAdjustmentsApi.page({
        page,
        limit,
        search,
        status,
        movementType,
        reasonId,
        locationId,
        dateFrom,
        dateTo,
      }),
    placeholderData: keepPreviousData,
    enabled: canView,
  });
  const post = useMutation({
    mutationFn: ({
      adjustment,
      confirm,
    }: {
      adjustment: InventoryAdjustment;
      confirm: boolean;
    }) =>
      inventoryAdjustmentsApi.post(
        Number(adjustment.inventoryAdjustmentId),
        confirm,
      ),
    onSuccess: async () => {
      setPostTarget(null);
      setNegativeTarget(null);
      setActionError("");
      await client.invalidateQueries({ queryKey: ["inventory-adjustments"] });
    },
    onError: (failure: Error, variables) => {
      if (!variables.confirm && /negative stock/i.test(failure.message)) {
        setPostTarget(null);
        setNegativeTarget(variables.adjustment);
        setActionError("");
      } else setActionError(failure.message);
    },
  });
  const cancel = useMutation({
    mutationFn: (adjustment: InventoryAdjustment) =>
      inventoryAdjustmentsApi.cancel(Number(adjustment.inventoryAdjustmentId)),
    onSuccess: async () => {
      setCancelTarget(null);
      setActionError("");
      await client.invalidateQueries({ queryKey: ["inventory-adjustments"] });
    },
    onError: (failure: Error) => setActionError(failure.message),
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, params.toString());
    } catch {
      /* URL remains the source of truth. */
    }
  }, [params, storageKey]);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    setSearchText(search);
  }, [search, location.key]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const updateParams = (patch: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(patch).forEach(([key, value]) =>
          value ? next.set(key, value) : next.delete(key),
        );
        return next;
      },
      { replace: true },
    );
  const changeSearch = (value: string) => {
    setSearchText(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => updateParams({ search: value.trim(), page: "1" }),
      300,
    );
  };
  const changeFilter = (patch: Record<string, string>) => {
    clearTimeout(searchTimer.current);
    updateParams({ search: searchText.trim(), page: "1", ...patch });
  };
  useEffect(() => {
    if (
      adjustments.data &&
      !adjustments.isPlaceholderData &&
      page > adjustments.data.totalPages
    )
      updateParams({ page: String(adjustments.data.totalPages) });
  }, [adjustments.data, adjustments.isPlaceholderData, page]);

  if (!canView)
    return (
      <div className="card empty">
        You do not have permission to view Inventory Adjustments.
      </div>
    );
  const result = adjustments.data;
  const returnTo = location.pathname + location.search;
  const start = result?.total ? (result.page - 1) * result.limit + 1 : 0;
  const end = result ? Math.min(result.page * result.limit, result.total) : 0;
  const activeLocations = (locations.data ?? []).filter(
    (item) =>
      item.isActive &&
      (auth.accessScope !== "LOCATION" ||
        auth.assignedLocations.some(
          (assigned) => String(assigned.locationId) === String(item.locationId),
        )),
  );
  const valueImpact = (value: string) => {
    const amount = Number(value);
    return `${amount >= 0 ? "+" : "−"}Rs ${money(Math.abs(amount))}`;
  };
  const busy = post.isPending || cancel.isPending;

  return (
    <div className="inventory-adjustments-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">INVENTORY</div>
          <h1>Inventory Adjustments</h1>
          <p>
            Create, post, and review stock corrections and opening inventory.
          </p>
        </div>
        {auth.permissions.includes("INVENTORY_ADJUSTMENT_CREATE") && (
          <Link
            className="btn btn-primary"
            to="/inventory/adjustments/new"
            state={{ returnTo }}
          >
            Create Adjustment
          </Link>
        )}
      </div>
      <div className="card">
        <div className="adjustment-list-toolbar">
          <input
            className="control"
            type="search"
            aria-label="Search adjustment number, reference or remarks"
            placeholder="Search number, reference or remarks"
            value={searchText}
            onChange={(event) => changeSearch(event.target.value)}
          />
          <label className="field">
            <span>Status</span>
            <select
              className="control"
              value={status}
              onChange={(event) => changeFilter({ status: event.target.value })}
            >
              <option value="">All statuses</option>
              {allowedStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Movement</span>
            <select
              className="control"
              value={movementType}
              onChange={(event) =>
                changeFilter({ movementType: event.target.value })
              }
            >
              <option value="">All movements</option>
              <option value="ADJI">Adjustment In</option>
              <option value="ADJO">Adjustment Out</option>
            </select>
          </label>
          <label className="field">
            <span>Reason</span>
            <select
              className="control"
              value={reasonId ?? ""}
              onChange={(event) =>
                changeFilter({ reasonId: event.target.value })
              }
            >
              <option value="">All reasons</option>
              {(reasons.data ?? []).map((reason) => (
                <option
                  key={reason.inventoryAdjustmentReasonId}
                  value={reason.inventoryAdjustmentReasonId}
                >
                  {reason.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Location</span>
            <select
              className="control"
              value={locationId ?? ""}
              onChange={(event) =>
                changeFilter({ locationId: event.target.value })
              }
            >
              <option value="">All locations</option>
              {activeLocations.map((item) => (
                <option key={item.locationId} value={item.locationId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input
              className="control"
              type="date"
              value={dateFrom}
              onChange={(event) =>
                changeFilter({ dateFrom: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              className="control"
              type="date"
              value={dateTo}
              onChange={(event) => changeFilter({ dateTo: event.target.value })}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {[
                  "Adjustment No",
                  "Date",
                  "Location",
                  "Movement",
                  "Reason",
                  "Status",
                  "Created By",
                  "Posted By",
                  "Lines",
                  "Value Impact",
                  "Actions",
                ].map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adjustments.isLoading ? (
                <tr>
                  <td colSpan={11} className="empty">
                    Loading Inventory Adjustments…
                  </td>
                </tr>
              ) : adjustments.isError ? (
                <tr>
                  <td colSpan={11} className="empty" role="alert">
                    {adjustments.error.message}{" "}
                    <button
                      className="btn btn-secondary"
                      onClick={() => void adjustments.refetch()}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : !result?.items.length ? (
                <tr>
                  <td colSpan={11} className="empty">
                    No Inventory Adjustments match these filters.
                  </td>
                </tr>
              ) : (
                result.items.map((adjustment) => (
                  <tr key={adjustment.inventoryAdjustmentId}>
                    <td>
                      {adjustment.adjustmentNumber ||
                        `Draft #${adjustment.inventoryAdjustmentId}`}
                    </td>
                    <td>{adjustment.adjustmentDate?.slice(0, 10) || "—"}</td>
                    <td>{adjustment.location?.name ?? "—"}</td>
                    <td>{movementLabel(adjustment.movementType)}</td>
                    <td>{adjustment.reason?.name ?? "—"}</td>
                    <td>
                      <span className="grn-status-badge">
                        {statusLabel(adjustment.status)}
                      </span>
                    </td>
                    <td>{adjustment.createdByName || "—"}</td>
                    <td>{adjustment.postedByName || "—"}</td>
                    <td>{adjustment.lineCount ?? "—"}</td>
                    <td className="right">
                      {adjustment.valueImpact != null
                        ? valueImpact(adjustment.valueImpact)
                        : "—"}
                    </td>
                    <td className="actions">
                      <Link
                        className="btn btn-ghost"
                        to={`/inventory/adjustments/${adjustment.inventoryAdjustmentId}`}
                        state={{ returnTo }}
                      >
                        View
                      </Link>
                      {adjustment.status === "DRAFT" &&
                        auth.permissions.includes(
                          "INVENTORY_ADJUSTMENT_UPDATE",
                        ) && (
                          <Link
                            className="btn btn-ghost"
                            to={`/inventory/adjustments/${adjustment.inventoryAdjustmentId}/edit`}
                            state={{ returnTo }}
                          >
                            Edit
                          </Link>
                        )}
                      {adjustment.status === "DRAFT" &&
                        auth.permissions.includes(
                          "INVENTORY_ADJUSTMENT_POST",
                        ) &&
                        !adjustment.reason?.requiresApproval &&
                        (adjustment.reason?.code !== "OPENING_INVENTORY" ||
                          auth.permissions.includes(
                            "INVENTORY_OPENING_POST",
                          )) && (
                          <button
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => {
                              setActionError("");
                              setPostTarget(adjustment);
                            }}
                          >
                            Post
                          </button>
                        )}
                      {adjustment.status === "DRAFT" &&
                        auth.permissions.includes(
                          "INVENTORY_ADJUSTMENT_CANCEL",
                        ) && (
                          <button
                            className="btn btn-danger-soft"
                            disabled={busy}
                            onClick={() => {
                              setActionError("");
                              setCancelTarget(adjustment);
                            }}
                          >
                            Cancel
                          </button>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="po-pagination">
          <span aria-live="polite">
            {adjustments.isFetching
              ? "Loading…"
              : `${start}–${end} of ${result?.total ?? 0} adjustments`}
          </span>
          <label>
            Rows per page{" "}
            <select
              className="control"
              value={limit}
              onChange={(event) => changeFilter({ limit: event.target.value })}
            >
              {[20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button
              className="btn btn-secondary"
              disabled={page <= 1 || adjustments.isFetching}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              Previous
            </button>
            <span>
              Page {result?.page ?? page} of {result?.totalPages ?? 1}
            </span>
            <button
              className="btn btn-secondary"
              disabled={
                !result || page >= result.totalPages || adjustments.isFetching
              }
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <Modal
        open={Boolean(postTarget)}
        title="Post this Inventory Adjustment?"
        onClose={() => !post.isPending && setPostTarget(null)}
      >
        <div className="modal-body">
          <p>Posting updates inventory and makes this document read-only.</p>
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={post.isPending}
            onClick={() => setPostTarget(null)}
          >
            Keep as draft
          </button>
          <button
            className="btn btn-primary"
            disabled={post.isPending || !postTarget}
            onClick={() =>
              postTarget &&
              post.mutate({ adjustment: postTarget, confirm: false })
            }
          >
            {post.isPending ? "Posting…" : "Post Adjustment"}
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(negativeTarget)}
        title="Negative stock confirmation"
        onClose={() => !post.isPending && setNegativeTarget(null)}
      >
        <div className="modal-body">
          <p>
            This adjustment will cause negative stock for one or more products.
            Do you want to continue?
          </p>
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={post.isPending}
            onClick={() => setNegativeTarget(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger-soft"
            disabled={post.isPending || !negativeTarget}
            onClick={() =>
              negativeTarget &&
              post.mutate({ adjustment: negativeTarget, confirm: true })
            }
          >
            {post.isPending ? "Posting…" : "Post Anyway"}
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(cancelTarget)}
        title="Cancel this draft Inventory Adjustment?"
        onClose={() => !cancel.isPending && setCancelTarget(null)}
      >
        <div className="modal-body">
          <p>
            The cancelled document remains available for audit and cannot be
            edited.
          </p>
          {actionError && (
            <p className="error" role="alert">
              {actionError}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={cancel.isPending}
            onClick={() => setCancelTarget(null)}
          >
            Keep draft
          </button>
          <button
            className="btn btn-danger-soft"
            disabled={cancel.isPending || !cancelTarget}
            onClick={() => cancelTarget && cancel.mutate(cancelTarget)}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel Adjustment"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
