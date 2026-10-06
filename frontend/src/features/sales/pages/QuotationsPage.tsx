import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { tenantProfileApi } from "../../tenants/api/tenantProfileApi";
import {
  Quotation,
  QuotationFilters,
  quotationsApi,
} from "../api/quotationsApi";
import { downloadQuotationPdf } from "./quotationPdf";
import "./quotations.css";

const dateLabel = (value: string) =>
  value?.slice(0, 10).split("-").reverse().join("/") || "—";
const money = (value: string) =>
  Number(value).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function QuotationsPage() {
  const navigate = useNavigate();
  const { role, permissions, tenant } = useAuth();
  const can = (code: string) =>
    role?.code === "TENANT_ADMIN" || permissions.includes(code);
  const [filters, setFilters] = useState<QuotationFilters>({
    page: 1,
    limit: 20,
  });
  const [error, setError] = useState("");
  const rows = useQuery({
    queryKey: ["quotations", filters],
    queryFn: () => quotationsApi.list(filters),
  });
  const locations = useQuery({
    queryKey: ["quotation-locations"],
    queryFn: quotationsApi.locations,
  });
  const profile = useQuery({
    queryKey: ["tenant-profile"],
    queryFn: tenantProfileApi.get,
  });
  const change = (key: keyof QuotationFilters, value: string | number) =>
    setFilters((x) => ({
      ...x,
      [key]: value,
      page: key === "page" ? Number(value) : 1,
    }));
  const act = async (
    quote: Quotation,
    action: "accept" | "reject" | "cancel",
  ) => {
    if (
      !confirm(
        `${action[0].toUpperCase()}${action.slice(1)} quotation ${quote.quotationNumber}?`,
      )
    )
      return;
    try {
      setError("");
      await quotationsApi.transition(quote.quotationId, action);
      await rows.refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="quotation-page">
      <header className="quotation-page-head">
        <div>
          <small>SALES / QUOTATIONS</small>
          <h1>Quotations</h1>
          <p>Create, track, and convert customer quotations.</p>
        </div>
        {can("SALES_QUOTATION_CREATE") && (
          <Link className="btn btn-primary" to="/quotations/new">
            + New quotation
          </Link>
        )}
      </header>
      <div className="card quotation-filter-grid">
        <label>
          Date from
          <input
            className="control"
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) => change("dateFrom", e.target.value)}
          />
        </label>
        <label>
          Date to
          <input
            className="control"
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) => change("dateTo", e.target.value)}
          />
        </label>
        <label>
          Quotation no
          <input
            className="control"
            value={filters.quotationNumber || ""}
            onChange={(e) => change("quotationNumber", e.target.value)}
          />
        </label>
        <label>
          Customer
          <input
            className="control"
            value={filters.customer || ""}
            onChange={(e) => change("customer", e.target.value)}
          />
        </label>
        <label>
          Location
          <select
            className="control"
            value={filters.locationId || ""}
            onChange={(e) => change("locationId", e.target.value)}
          >
            <option value="">All locations</option>
            {(locations.data || []).map((x) => (
              <option key={x.locationId} value={x.locationId}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            className="control"
            value={filters.status || ""}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {[
              "DRAFT",
              "SENT",
              "EXPIRED",
              "ACCEPTED",
              "REJECTED",
              "CANCELLED",
              "CONVERTED",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            className="control"
            value={filters.quotationType || ""}
            onChange={(e) => change("quotationType", e.target.value)}
          >
            <option value="">All types</option>
            <option>RETAIL</option>
            <option>WHOLESALE</option>
          </select>
        </label>
      </div>
      {error && <div className="quotation-error">{error}</div>}
      <div className="card quotation-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Quotation No</th>
              <th>Date</th>
              <th>Valid Until</th>
              <th>Customer</th>
              <th>Location</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Prepared By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rows.data?.items || []).map((q) => (
              <tr key={q.quotationId}>
                <td>
                  <Link to={`/quotations/${q.quotationId}`}>
                    {q.quotationNumber}
                  </Link>
                </td>
                <td>{dateLabel(q.quotationDate)}</td>
                <td>{dateLabel(q.validUntil)}</td>
                <td>{q.customerNameSnapshot}</td>
                <td>{q.locationNameSnapshot}</td>
                <td>{q.quotationType}</td>
                <td>LKR {money(q.grandTotal)}</td>
                <td>
                  <span
                    className={`quotation-status ${q.effectiveStatus.toLowerCase()}`}
                  >
                    {q.effectiveStatus}
                  </span>
                </td>
                <td>
                  {q.createdByUser?.firstName ||
                    q.createdByUser?.username ||
                    "—"}
                </td>
                <td>
                  <div className="quotation-row-actions">
                    <Link to={`/quotations/${q.quotationId}`}>View</Link>
                    {q.status === "DRAFT" && can("SALES_QUOTATION_EDIT") && (
                      <Link to={`/quotations/${q.quotationId}/edit`}>Edit</Link>
                    )}
                    {q.status !== "DRAFT" && (
                      <button
                        onClick={() =>
                          quotationsApi
                            .get(q.quotationId)
                            .then((full) =>
                              downloadQuotationPdf(
                                full,
                                profile.data?.legalName ||
                                  tenant?.tenantName ||
                                  "Company",
                                "download",
                                profile.data,
                              ),
                            )
                            .catch((e) => setError((e as Error).message))
                        }
                      >
                        PDF
                      </button>
                    )}
                    {q.status === "SENT" &&
                      can("SALES_QUOTATION_ACCEPT") &&
                      q.effectiveStatus !== "EXPIRED" && (
                        <button onClick={() => act(q, "accept")}>Accept</button>
                      )}
                    {q.status === "SENT" && can("SALES_QUOTATION_CANCEL") && (
                      <button onClick={() => act(q, "reject")}>Reject</button>
                    )}
                    {["DRAFT", "SENT"].includes(q.status) &&
                      can("SALES_QUOTATION_CANCEL") && (
                        <button onClick={() => act(q, "cancel")}>Cancel</button>
                      )}
                    {q.status === "ACCEPTED" &&
                      can("SALES_QUOTATION_CONVERT") && (
                        <button
                          onClick={() => {
                            if (confirm(`Convert ${q.quotationNumber} in POS?`))
                              navigate(`/billing?quotationId=${q.quotationId}`);
                          }}
                        >
                          Convert to POS
                        </button>
                      )}
                    {q.convertedInvoiceId && (
                      <Link to={`/sales?invoiceId=${q.convertedInvoiceId}`}>
                        Invoice
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.isPending && !rows.data?.items.length && (
          <div className="empty">No quotations found.</div>
        )}
      </div>
      <div className="quotation-pagination">
        <span>{rows.data?.total || 0} quotations</span>
        <select
          className="control"
          value={filters.limit}
          onChange={(e) => change("limit", Number(e.target.value))}
        >
          {[10, 20, 50, 100].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          disabled={filters.page <= 1}
          onClick={() => change("page", filters.page - 1)}
        >
          Previous
        </button>
        <span>Page {filters.page}</span>
        <button
          className="btn btn-secondary"
          disabled={filters.page * filters.limit >= (rows.data?.total || 0)}
          onClick={() => change("page", filters.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
