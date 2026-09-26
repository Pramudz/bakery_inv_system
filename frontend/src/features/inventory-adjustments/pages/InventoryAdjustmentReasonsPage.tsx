import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import {
  inventoryAdjustmentsApi,
  type AdjustmentCostingPolicy,
  type AdjustmentDirection,
  type AdjustmentReason,
  type AdjustmentReasonInput,
} from "../api/inventoryAdjustmentsApi";

interface ReasonForm extends AdjustmentReasonInput {
  isActive: boolean;
}
const blankReason = (): ReasonForm => ({
  code: "",
  name: "",
  allowedDirection: "IN",
  reasonCategory: "",
  costingPolicy: "CURRENT_WAVG",
  requiresRemarks: false,
  requiresApproval: false,
  isActive: true,
});

export function InventoryAdjustmentReasonsPage() {
  const auth = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const pageValue = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = [20, 50, 100].includes(Number(params.get("limit")))
    ? Number(params.get("limit"))
    : 20;
  const search = params.get("search") ?? "";
  const direction = ["IN", "OUT", "BOTH"].includes(
    params.get("direction") ?? "",
  )
    ? params.get("direction")!
    : "";
  const active = ["true", "false"].includes(params.get("active") ?? "")
    ? params.get("active")!
    : "";
  const system = ["true", "false"].includes(params.get("system") ?? "")
    ? params.get("system")!
    : "";
  const [searchText, setSearchText] = useState(search);
  const [editing, setEditing] = useState<AdjustmentReason | null | "create">(
    null,
  );
  const [form, setForm] = useState<ReasonForm>(blankReason);
  const [error, setError] = useState("");
  const [activeTarget, setActiveTarget] = useState<AdjustmentReason | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const canView = auth.permissions.includes("INVENTORY_ADJUSTMENT_VIEW");
  const canManage = auth.permissions.includes(
    "INVENTORY_ADJUSTMENT_REASON_MANAGE",
  );
  const reasons = useQuery({
    queryKey: [
      "inventory-adjustment-reasons",
      "page",
      auth.tenant?.tenantId,
      page,
      limit,
      search,
      direction,
      active,
      system,
    ],
    queryFn: () =>
      inventoryAdjustmentsApi.reasonPage({
        page,
        limit,
        search,
        direction,
        active,
        system,
      }),
    placeholderData: keepPreviousData,
    enabled: canView,
  });
  const save = useMutation({
    mutationFn: async () => {
      const code = form.code.trim().toUpperCase();
      const name = form.name.trim();
      if (!code || !/^[A-Z][A-Z0-9_]*$/.test(code))
        throw new Error(
          "Code must start with a letter and contain only letters, numbers, or underscores.",
        );
      if (!name) throw new Error("Reason name is required.");
      if (
        form.costingPolicy === "MANUAL_REQUIRED" &&
        form.allowedDirection !== "IN"
      )
        throw new Error(
          "Manual-required costing is supported only for IN reasons.",
        );
      const payload: AdjustmentReasonInput = {
        code,
        name,
        allowedDirection: form.allowedDirection,
        reasonCategory: form.reasonCategory?.trim() || undefined,
        costingPolicy: form.costingPolicy,
        requiresRemarks: form.requiresRemarks,
        requiresApproval: form.requiresApproval,
      };
      const saved =
        editing === "create"
          ? await inventoryAdjustmentsApi.createReason(payload)
          : await inventoryAdjustmentsApi.updateReason(
              Number(editing?.inventoryAdjustmentReasonId),
              payload,
            );
      if (saved.isActive !== form.isActive)
        await inventoryAdjustmentsApi.setReasonActive(
          Number(saved.inventoryAdjustmentReasonId),
          form.isActive,
        );
      return saved;
    },
    onSuccess: async () => {
      setEditing(null);
      setError("");
      await client.invalidateQueries({
        queryKey: ["inventory-adjustment-reasons"],
      });
    },
    onError: (failure: Error) => setError(failure.message),
  });
  const toggle = useMutation({
    mutationFn: (reason: AdjustmentReason) =>
      inventoryAdjustmentsApi.setReasonActive(
        Number(reason.inventoryAdjustmentReasonId),
        !reason.isActive,
      ),
    onSuccess: async () => {
      setActiveTarget(null);
      setError("");
      await client.invalidateQueries({
        queryKey: ["inventory-adjustment-reasons"],
      });
    },
    onError: (failure: Error) => setError(failure.message),
  });
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
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => updateParams({ search: value.trim(), page: "1" }),
      300,
    );
  };
  const changeFilter = (patch: Record<string, string>) => {
    clearTimeout(timer.current);
    updateParams({ search: searchText.trim(), page: "1", ...patch });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (
      reasons.data &&
      !reasons.isPlaceholderData &&
      page > reasons.data.totalPages
    )
      updateParams({ page: String(reasons.data.totalPages) });
  }, [page, reasons.data, reasons.isPlaceholderData]);

  if (!canView)
    return (
      <div className="card empty">
        You do not have permission to view Adjustment Reasons.
      </div>
    );
  const result = reasons.data;
  const start = result?.total ? (result.page - 1) * result.limit + 1 : 0;
  const end = result ? Math.min(result.page * result.limit, result.total) : 0;
  const openCreate = () => {
    setForm(blankReason());
    setEditing("create");
    setError("");
  };
  const openEdit = (reason: AdjustmentReason) => {
    setForm({
      code: reason.code,
      name: reason.name,
      allowedDirection: reason.allowedDirection,
      reasonCategory: reason.reasonCategory ?? "",
      costingPolicy: reason.costingPolicy,
      requiresRemarks: reason.requiresRemarks,
      requiresApproval: reason.requiresApproval,
      isActive: reason.isActive,
    });
    setEditing(reason);
    setError("");
  };
  const changeForm = (patch: Partial<ReasonForm>) => {
    const next = { ...form, ...patch };
    if (patch.costingPolicy === "MANUAL_REQUIRED") next.allowedDirection = "IN";
    setForm(next);
    setError("");
  };

  return (
    <div className="inventory-adjustments-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">INVENTORY / SETTINGS</div>
          <h1>Adjustment Reasons</h1>
          <p>
            Manage auditable stock-adjustment reasons and valuation policies.
          </p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={openCreate}>
            Create Reason
          </button>
        )}
      </div>
      <div className="card">
        <div className="adjustment-reason-toolbar">
          <input
            className="control"
            type="search"
            placeholder="Search code, name or category"
            aria-label="Search adjustment reasons"
            value={searchText}
            onChange={(event) => changeSearch(event.target.value)}
          />
          <label className="field">
            <span>Direction</span>
            <select
              className="control"
              value={direction}
              onChange={(event) =>
                changeFilter({ direction: event.target.value })
              }
            >
              <option value="">All</option>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
              <option value="BOTH">BOTH</option>
            </select>
          </label>
          <label className="field">
            <span>Active</span>
            <select
              className="control"
              value={active}
              onChange={(event) => changeFilter({ active: event.target.value })}
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <label className="field">
            <span>Ownership</span>
            <select
              className="control"
              value={system}
              onChange={(event) => changeFilter({ system: event.target.value })}
            >
              <option value="">System &amp; custom</option>
              <option value="true">System</option>
              <option value="false">Custom</option>
            </select>
          </label>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {[
                  "Code",
                  "Name",
                  "Direction",
                  "Category",
                  "Costing Policy",
                  "Remarks",
                  "Approval",
                  "System",
                  "Active",
                  "Actions",
                ].map((title) => (
                  <th key={title}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reasons.isLoading ? (
                <tr>
                  <td colSpan={10} className="empty">
                    Loading Adjustment Reasons…
                  </td>
                </tr>
              ) : reasons.isError ? (
                <tr>
                  <td colSpan={10} className="empty" role="alert">
                    {reasons.error.message}{" "}
                    <button
                      className="btn btn-secondary"
                      onClick={() => void reasons.refetch()}
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : !result?.items.length ? (
                <tr>
                  <td colSpan={10} className="empty">
                    No reasons match these filters.
                  </td>
                </tr>
              ) : (
                result.items.map((reason) => (
                  <tr key={reason.inventoryAdjustmentReasonId}>
                    <td>
                      <strong>{reason.code}</strong>
                    </td>
                    <td>{reason.name}</td>
                    <td>{reason.allowedDirection}</td>
                    <td>{reason.reasonCategory || "—"}</td>
                    <td>
                      {reason.costingPolicy === "CURRENT_WAVG"
                        ? "Current WAVG"
                        : "Manual required"}
                    </td>
                    <td>{reason.requiresRemarks ? "Yes" : "No"}</td>
                    <td>{reason.requiresApproval ? "Yes" : "No"}</td>
                    <td>
                      {reason.isSystemReason ? (
                        <span className="reason-system-badge">Protected</span>
                      ) : (
                        "Custom"
                      )}
                    </td>
                    <td>{reason.isActive ? "Active" : "Inactive"}</td>
                    <td className="actions">
                      {!reason.isSystemReason && canManage ? (
                        <>
                          <button
                            className="btn btn-ghost"
                            onClick={() => openEdit(reason)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              setError("");
                              setActiveTarget(reason);
                            }}
                          >
                            {reason.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </>
                      ) : (
                        <span className="muted">Protected</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="po-pagination">
          <span>
            {reasons.isFetching
              ? "Loading…"
              : `${start}–${end} of ${result?.total ?? 0} reasons`}
          </span>
          <label>
            Rows per page{" "}
            <select
              className="control"
              value={limit}
              onChange={(event) => changeFilter({ limit: event.target.value })}
            >
              {[20, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
          <div>
            <button
              className="btn btn-secondary"
              disabled={page <= 1 || reasons.isFetching}
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
                !result || page >= result.totalPages || reasons.isFetching
              }
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <Modal
        open={Boolean(editing)}
        title={
          editing === "create"
            ? "Create Adjustment Reason"
            : "Edit Adjustment Reason"
        }
        onClose={() => !save.isPending && setEditing(null)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="modal-body reason-form">
            <label className="field">
              <span>Code *</span>
              <input
                className="control"
                required
                maxLength={50}
                value={form.code}
                onChange={(event) =>
                  changeForm({ code: event.target.value.toUpperCase() })
                }
              />
            </label>
            <label className="field">
              <span>Name *</span>
              <input
                className="control"
                required
                maxLength={150}
                value={form.name}
                onChange={(event) => changeForm({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Direction *</span>
              <select
                className="control"
                value={form.allowedDirection}
                onChange={(event) =>
                  changeForm({
                    allowedDirection: event.target.value as AdjustmentDirection,
                  })
                }
                disabled={form.costingPolicy === "MANUAL_REQUIRED"}
              >
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
                <option value="BOTH">BOTH</option>
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <input
                className="control"
                maxLength={100}
                value={form.reasonCategory}
                onChange={(event) =>
                  changeForm({ reasonCategory: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Costing Policy *</span>
              <select
                className="control"
                value={form.costingPolicy}
                onChange={(event) =>
                  changeForm({
                    costingPolicy: event.target
                      .value as AdjustmentCostingPolicy,
                  })
                }
              >
                <option value="CURRENT_WAVG">Current WAVG</option>
                <option value="MANUAL_REQUIRED">Manual required</option>
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.requiresRemarks}
                onChange={(event) =>
                  changeForm({ requiresRemarks: event.target.checked })
                }
              />{" "}
              Requires remarks
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(event) =>
                  changeForm({ requiresApproval: event.target.checked })
                }
              />{" "}
              Requires approval
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  changeForm({ isActive: event.target.checked })
                }
              />{" "}
              Active
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-foot">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={save.isPending}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={save.isPending}
            >
              {save.isPending ? "Saving…" : "Save Reason"}
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(activeTarget)}
        title={`${activeTarget?.isActive ? "Deactivate" : "Activate"} this custom reason?`}
        onClose={() => !toggle.isPending && setActiveTarget(null)}
      >
        <div className="modal-body">
          <p>{activeTarget?.name}</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={toggle.isPending}
            onClick={() => setActiveTarget(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={toggle.isPending || !activeTarget}
            onClick={() => activeTarget && toggle.mutate(activeTarget)}
          >
            {toggle.isPending
              ? "Saving…"
              : activeTarget?.isActive
                ? "Deactivate"
                : "Activate"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
