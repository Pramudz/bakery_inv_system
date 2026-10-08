import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { customersApi } from "../../customers/api/customersApi";
import { useAuth } from "../../auth/AuthContext";
import { tenantProfileApi } from "../../tenants/api/tenantProfileApi";
import { Quotation, quotationsApi, SaveQuotation } from "../api/quotationsApi";
import { downloadQuotationPdf } from "./quotationPdf";
import { filterPosProducts } from "../posProductSearch";
import "./quotations.css";

type Item = { productId: number; code: string; name: string; quantity: number };
const money = (value: number | string) =>
  Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const businessDate = (zone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function QuotationScreen({
  mode,
}: {
  mode: "create" | "view" | "edit";
}) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { tenant, tenantUser, currentLocationId, role, permissions } =
    useAuth();
  const can = (code: string) =>
    role?.code === "TENANT_ADMIN" || permissions.includes(code);
  const date = businessDate(tenant?.timeZone || "Asia/Colombo");
  const [record, setRecord] = useState<Quotation | null>(null);
  const [locationId, setLocationId] = useState(Number(currentLocationId || 0));
  const [customerId, setCustomerId] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    customerCode: "",
    customerName: "",
    phone: "",
    addressLine1: "",
  });
  const [quotationDate, setQuotationDate] = useState(date);
  const [validUntil, setValidUntil] = useState(addDays(date, 7));
  const [quotationType, setQuotationType] = useState<"RETAIL" | "WHOLESALE">(
    "RETAIL",
  );
  const [items, setItems] = useState<Item[]>([]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = mode !== "view" && (!record || record.status === "DRAFT");
  const locations = useQuery({
    queryKey: ["quotation-locations"],
    queryFn: quotationsApi.locations,
  });
  const profile = useQuery({
    queryKey: ["tenant-profile"],
    queryFn: tenantProfileApi.get,
  });
  const customers = useQuery({
    queryKey: ["quotation-customers"],
    queryFn: quotationsApi.customers,
    enabled: mode !== "view",
  });
  const loaded = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => quotationsApi.get(Number(id)),
    enabled: !!id,
  });
  const catalog = useQuery({
    queryKey: ["quotation-catalog", locationId, quotationType],
    queryFn: () => quotationsApi.catalog(locationId, quotationType),
    enabled: editable && locationId > 0,
  });
  const prices = useQuery({
    queryKey: [
      "quotation-prices",
      locationId,
      quotationType,
      items.map((x) => [x.productId, x.quantity]),
    ],
    queryFn: () =>
      quotationsApi.price({
        locationId,
        saleType: quotationType,
        details: items.map((x) => ({
          productId: x.productId,
          quantity: x.quantity,
        })),
      }),
    enabled:
      editable &&
      locationId > 0 &&
      items.length > 0 &&
      items.every((x) => x.quantity > 0),
    retry: false,
  });
  useEffect(() => {
    if (!locationId && locations.data?.length)
      setLocationId(locations.data[0].locationId);
  }, [locations.data, locationId]);
  useEffect(() => {
    if (!loaded.data) return;
    const q = loaded.data;
    setRecord(q);
    setLocationId(Number(q.locationId));
    setCustomerId(Number(q.customerId));
    setCustomerSearch(q.customerCodeSnapshot);
    setQuotationDate(q.quotationDate.slice(0, 10));
    setValidUntil(q.validUntil.slice(0, 10));
    setQuotationType(q.quotationType);
    setItems(
      q.lines.map((x) => ({
        productId: Number(x.productId),
        code: x.productCodeSnapshot,
        name: x.productNameSnapshot,
        quantity: Number(x.quantity),
      })),
    );
    setNotes(q.notes || "");
    setTerms(q.termsAndConditions || "");
  }, [loaded.data]);
  const selectedCustomer = (customers.data || []).find(
    (x) => Number(x.customerId) === customerId,
  );
  const searchedCustomers = (customers.data || [])
    .filter(
      (x) =>
        x.isActive &&
        `${x.customerCode} ${x.customerName} ${x.phone || ""} ${x.mobile || ""}`
          .toLowerCase()
          .includes(customerSearch.toLowerCase()),
    )
    .slice(0, 10);
  const categories = useMemo(
    () => [
      "All categories",
      ...new Set((catalog.data || []).map((x) => x.category)),
    ],
    [catalog.data],
  );
  const visibleProducts = filterPosProducts(
    catalog.data || [],
    productSearch,
    category,
  ).slice(0, 40);
  const persisted = !!record && mode === "view";
  const subtotal = persisted
    ? Number(record.subtotal)
    : Number(prices.data?.subtotal || 0);
  const discount = persisted
    ? Number(record.discountTotal)
    : Number(prices.data?.discountTotal || 0);
  const total = persisted
    ? Number(record.grandTotal)
    : Number(prices.data?.grandTotal || 0);
  const displayLine = (item: Item) =>
    persisted
      ? record?.lines.find((x) => Number(x.productId) === item.productId)
      : prices.data?.lines.find((x) => Number(x.productId) === item.productId);
  const payload = (): SaveQuotation => ({
    locationId,
    customerId,
    quotationDate,
    validUntil,
    quotationType,
    lines: items.map((x) => ({ productId: x.productId, quantity: x.quantity })),
    notes,
    termsAndConditions: terms,
  });
  const save = async (send: boolean) => {
    if (
      !customerId ||
      !locationId ||
      !items.length ||
      items.some((x) => x.quantity <= 0)
    ) {
      setError(
        "Select a location, customer, and at least one product with a positive quantity.",
      );
      return;
    }
    if (send && !confirm("Generate quotation and lock its commercial details?"))
      return;
    setBusy(true);
    setError("");
    try {
      const result = record
        ? await quotationsApi.update(record.quotationId, payload())
        : await quotationsApi.create(payload());
      if (send) await quotationsApi.transition(result.quotationId, "send");
      navigate(`/quotations/${result.quotationId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const transition = async (action: "accept" | "reject" | "cancel") => {
    if (
      !record ||
      !confirm(
        `${action[0].toUpperCase()}${action.slice(1)} quotation ${record.quotationNumber}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await quotationsApi.transition(record.quotationId, action);
      setRecord(result);
      await loaded.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const createCustomer = async () => {
    if (!newCustomer.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await customersApi.create({
        ...newCustomer,
        isActive: true,
      });
      setCustomerId(Number(created.customerId));
      setCustomerSearch(created.customerCode);
      setShowNew(false);
      await customers.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (id && loaded.isPending)
    return <div className="quotation-page">Loading quotation…</div>;
  if (id && loaded.isError)
    return (
      <div className="quotation-page quotation-error">
        {loaded.error.message}
      </div>
    );
  return (
    <div className="quotation-page">
      <header className="quotation-page-head">
        <div>
          <small>SALES / QUOTATIONS</small>
          <h1>Quotation</h1>
          <p>
            Create a customer quotation, add products, review totals and
            generate the quotation.
          </p>
        </div>
        <div className="quotation-header-actions">
          <Link className="btn btn-secondary" to="/quotations">
            All quotations
          </Link>
          <span
            className={`quotation-status ${(record?.effectiveStatus || "draft").toLowerCase()}`}
          >
            {record?.effectiveStatus || "DRAFT QUOTATION"}
          </span>
        </div>
      </header>
      {record && mode === "view" && record.status !== "DRAFT" && (
        <div className="quotation-pdf-actions">
          <button
            className="btn btn-secondary"
            onClick={() =>
              downloadQuotationPdf(
                record,
                profile.data?.legalName || tenant?.tenantName || "Company",
                "view",
                profile.data,
              )
            }
          >
            View PDF
          </button>
          <button
            className="btn btn-secondary"
            onClick={() =>
              downloadQuotationPdf(
                record,
                profile.data?.legalName || tenant?.tenantName || "Company",
                "print",
                profile.data,
              )
            }
          >
            Print
          </button>
        </div>
      )}
      <div className="card quotation-meta">
        <div>
          <small>Location / Branch</small>
          <strong>
            {locations.data?.find((x) => Number(x.locationId) === locationId)
              ?.name ||
              record?.locationNameSnapshot ||
              "Select location"}
          </strong>
        </div>
        <div>
          <small>Quotation Number</small>
          <strong>{record?.quotationNumber || "Auto on save"}</strong>
        </div>
        <div>
          <small>Quotation Date</small>
          <strong>{quotationDate.split("-").reverse().join("/")}</strong>
        </div>
        <div>
          <small>Valid Until</small>
          <strong>{validUntil.split("-").reverse().join("/")}</strong>
        </div>
      </div>
      {error && <div className="quotation-error">{error}</div>}
      {record?.effectiveStatus === "EXPIRED" && (
        <div className="quotation-error">
          Expired on {validUntil.split("-").reverse().join("/")}
        </div>
      )}
      <div className="quotation-layout">
        <main className="quotation-main">
          <div className="card billing-location-section">
            <div>
              <h2>Location</h2>
              <p>Select the issuing location for this quotation.</p>
            </div>
            <select
              className="control"
              value={locationId || ""}
              disabled={!editable}
              onChange={(e) => {
                setLocationId(Number(e.target.value));
                setItems([]);
              }}
            >
              <option value="">Select location</option>
              {(locations.data || []).map((x) => (
                <option key={x.locationId} value={x.locationId}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <div className="card pos-product-picker">
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="section-number">F1</span> Add products
                </h2>
                <p>Search products and add them to the quotation below.</p>
              </div>
            </div>
            {editable && (
              <>
                <div className="pos-search-row">
                  <div className="sales-search">
                    <span>⌕</span>
                    <input
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Enter item code or product name..."
                    />
                  </div>
                  <select
                    className="control"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setProductSearch("");
                      setCategory("All categories");
                    }}
                  >
                    Clear
                  </button>
                </div>
                {productSearch || category !== "All categories" ? (
                  <div className="pos-product-results">
                    {visibleProducts.map((x) => (
                      <button
                        type="button"
                        className="pos-product-item"
                        key={x.productId}
                        onClick={() =>
                          setItems((rows) =>
                            rows.some(
                              (row) => row.productId === Number(x.productId),
                            )
                              ? rows.map((row) =>
                                  row.productId === Number(x.productId)
                                    ? { ...row, quantity: row.quantity + 1 }
                                    : row,
                                )
                              : [
                                  ...rows,
                                  {
                                    productId: Number(x.productId),
                                    code: x.code,
                                    name: x.name,
                                    quantity: 1,
                                  },
                                ],
                          )
                        }
                      >
                        <span className="product-dot">{x.name[0]}</span>
                        <span>
                          <strong>{x.name}</strong>
                          <small>
                            {x.code} · {x.category} · {Number(x.stock)}{" "}
                            available
                          </small>
                        </span>
                        <span className="product-sale-price">
                          <b>LKR {money(x.pricing.unitPrice)}</b>
                          <small>Add to quotation</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="product-search-empty">
                    <span>⌕</span>
                    <strong>Find a product to begin</strong>
                    <small>
                      Enter an item code, product name, or select a category.
                    </small>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="card sale-type-section">
            <div className="sale-type-heading">
              <span>F2</span>
              <div>
                <h2>Quotation type</h2>
                <p>Select the type of quotation to apply pricing.</p>
              </div>
            </div>
            <div className="sale-type-options">
              {(["RETAIL", "WHOLESALE"] as const).map((type) => (
                <button
                  key={type}
                  disabled={!editable}
                  className={quotationType === type ? "active" : ""}
                  onClick={() => setQuotationType(type)}
                >
                  <span>▤</span>
                  <b>{type === "RETAIL" ? "Retail" : "Wholesale"}</b>
                  <small>
                    {type === "RETAIL"
                      ? "Standard selling price"
                      : "Wholesale price / bulk discount"}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div className="card pos-cart">
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="section-number">F3</span> Quotation items{" "}
                  <span className="code-chip">{items.length} items</span>
                </h2>
                <p>Adjust quantities while this quotation is a draft.</p>
              </div>
              {editable && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setItems([])}
                >
                  Clear items
                </button>
              )}
            </div>
            <div className="sales-table-wrap">
              <table className="table pos-cart-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item code</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Discount (%)</th>
                    <th>Discount (LKR)</th>
                    <th>Gross Total</th>
                    <th>Net Total</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const price = displayLine(item);
                    return (
                      <tr key={item.productId}>
                        <td>{index + 1}</td>
                        <td>{item.code}</td>
                        <td>{item.name}</td>
                        <td>
                          {editable ? (
                            <input
                              className="control pos-small-input"
                              type="number"
                              min="0.0001"
                              step="1"
                              value={item.quantity}
                              onChange={(e) =>
                                setItems((rows) =>
                                  rows.map((x) =>
                                    x.productId === item.productId
                                      ? {
                                          ...x,
                                          quantity: Number(e.target.value),
                                        }
                                      : x,
                                  ),
                                )
                              }
                            />
                          ) : (
                            item.quantity
                          )}
                        </td>
                        <td>{money(price?.unitPrice || 0)}</td>
                        <td>
                          {money(
                            "discountPercent" in (price || {})
                              ? (price as any).discountPercent
                              : (price as any)?.discountPercentage || 0,
                          )}
                        </td>
                        <td>{money(price?.discountAmount || 0)}</td>
                        <td>{money(price?.grossTotal || 0)}</td>
                        <td>
                          <strong>LKR {money(price?.netTotal || 0)}</strong>
                        </td>
                        <td>
                          {editable && (
                            <button
                              className="sales-more cart-remove"
                              onClick={() =>
                                setItems((rows) =>
                                  rows.filter(
                                    (x) => x.productId !== item.productId,
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!items.length && (
                <div className="empty">
                  No items in this quotation. Select a product above.
                </div>
              )}
            </div>
          </div>
          <div className="card quotation-additional">
            <h2>Additional information</h2>
            <div>
              <label>
                Notes
                <textarea
                  className="control"
                  maxLength={500}
                  disabled={!editable}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes for this quotation..."
                />
              </label>
              <label>
                Terms &amp; Conditions
                <textarea
                  className="control"
                  maxLength={500}
                  disabled={!editable}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter terms and conditions for this quotation..."
                />
              </label>
            </div>
            <div className="quotation-dates">
              <label>
                Quotation date
                <input
                  className="control"
                  type="date"
                  disabled={!editable}
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                />
              </label>
              <label>
                Valid until
                <input
                  className="control"
                  type="date"
                  min={quotationDate}
                  disabled={!editable}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </label>
            </div>
          </div>
        </main>
        <aside className="quotation-sidebar">
          <div className="card pos-customer">
            <div className="pos-panel-title">
              <h2>
                <span className="panel-shortcut">F4</span> Customer
              </h2>
              {editable && (
                <div className="customer-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowNew((x) => !x)}
                  >
                    + New
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setCustomerId(0);
                      setCustomerSearch("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            <label className="customer-search-label">
              Customer Code / Tel / Name
            </label>
            {editable && (
              <div className="sales-search customer-search">
                <span>⌕</span>
                <input
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerId(0);
                  }}
                  placeholder="Search customer..."
                />
              </div>
            )}
            {editable && customerSearch && !customerId && (
              <div className="customer-results">
                {searchedCustomers.map((x) => (
                  <button
                    key={x.customerId}
                    onClick={() => {
                      setCustomerId(Number(x.customerId));
                      setCustomerSearch(x.customerCode);
                    }}
                  >
                    <span>
                      <strong>{x.customerName}</strong>
                      <small>
                        {x.customerCode} · {x.phone || x.mobile || ""}
                      </small>
                    </span>
                    <b>+</b>
                  </button>
                ))}
              </div>
            )}
            {showNew && editable && (
              <div className="quotation-new-customer">
                {(
                  [
                    "customerCode",
                    "customerName",
                    "phone",
                    "addressLine1",
                  ] as const
                ).map((key) => (
                  <input
                    key={key}
                    className="control"
                    placeholder={key.replace(/([A-Z])/g, " $1")}
                    value={newCustomer[key]}
                    onChange={(e) =>
                      setNewCustomer((x) => ({ ...x, [key]: e.target.value }))
                    }
                  />
                ))}
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={createCustomer}
                >
                  Create customer
                </button>
              </div>
            )}
            {(selectedCustomer || record) && (
              <div className="selected-customer">
                <span>
                  {
                    (selectedCustomer?.customerName ||
                      record?.customerNameSnapshot ||
                      "?")[0]
                  }
                </span>
                <div>
                  <small>
                    {selectedCustomer?.customerCode ||
                      record?.customerCodeSnapshot}
                  </small>
                  <strong>
                    {selectedCustomer?.customerName ||
                      record?.customerNameSnapshot}
                  </strong>
                  <small>
                    {selectedCustomer?.phone ||
                      record?.customerPhoneSnapshot ||
                      ""}
                  </small>
                  <small>
                    {selectedCustomer?.addressLine1 ||
                      record?.customerAddressSnapshot ||
                      ""}
                  </small>
                </div>
              </div>
            )}
          </div>
          <div className="card quotation-summary">
            <div className="pos-panel-title">
              <h2>Quotation summary</h2>
              <span
                className={`quotation-status ${(record?.effectiveStatus || "draft").toLowerCase()}`}
              >
                {record?.effectiveStatus || "DRAFT"}
              </span>
            </div>
            <div className="checkout-summary">
              <h3>Summary</h3>
              <div className="summary-line">
                <span>Items</span>
                <b>{items.reduce((sum, x) => sum + x.quantity, 0)} units</b>
              </div>
              <div className="summary-line">
                <span>Subtotal</span>
                <b>LKR {money(subtotal)}</b>
              </div>
              <div className="summary-line">
                <span>Discounts</span>
                <b>- LKR {money(discount)}</b>
              </div>
              <div className="summary-total">
                <span>QUOTATION TOTAL</span>
                <strong>LKR {money(total)}</strong>
              </div>
              <div className="summary-line">
                <span>Valid until</span>
                <b>{validUntil.split("-").reverse().join("/")}</b>
              </div>
              <div className="summary-line">
                <span>Customer</span>
                <b>
                  {selectedCustomer?.customerName ||
                    record?.customerNameSnapshot ||
                    "—"}
                </b>
              </div>
              <div className="summary-line">
                <span>Location</span>
                <b>
                  {locations.data?.find(
                    (x) => Number(x.locationId) === locationId,
                  )?.name ||
                    record?.locationNameSnapshot ||
                    "—"}
                </b>
              </div>
              <div className="summary-line">
                <span>Prepared by</span>
                <b>
                  {record?.createdByUser?.firstName ||
                    tenantUser?.firstName ||
                    tenantUser?.username ||
                    "—"}
                </b>
              </div>
            </div>
            <div className="quotation-action-stack">
              {editable && (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => save(false)}
                  >
                    Save draft
                  </button>
                  {can("SALES_QUOTATION_SEND") && (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => save(true)}
                    >
                      Generate quotation
                    </button>
                  )}
                </>
              )}
              {record && mode === "view" && (
                <>
                  {record.status === "DRAFT" && can("SALES_QUOTATION_EDIT") && (
                    <Link
                      className="btn btn-primary"
                      to={`/quotations/${record.quotationId}/edit`}
                    >
                      Edit draft
                    </Link>
                  )}
                  {record.status !== "DRAFT" && (
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        downloadQuotationPdf(
                          record,
                          profile.data?.legalName ||
                            tenant?.tenantName ||
                            "Company",
                          "download",
                          profile.data,
                        )
                      }
                    >
                      Download PDF
                    </button>
                  )}
                  {record.status === "SENT" && (
                    <>
                      {can("SALES_QUOTATION_ACCEPT") &&
                        record.effectiveStatus !== "EXPIRED" && (
                          <button
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => transition("accept")}
                          >
                            Accept
                          </button>
                        )}
                      {can("SALES_QUOTATION_CANCEL") && (
                        <>
                          <button
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => transition("reject")}
                          >
                            Reject
                          </button>
                          <button
                            className="btn btn-secondary"
                            disabled={busy}
                            onClick={() => transition("cancel")}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {record.status === "DRAFT" &&
                    can("SALES_QUOTATION_CANCEL") && (
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => transition("cancel")}
                      >
                        Cancel
                      </button>
                    )}
                  {record.status === "ACCEPTED" &&
                    can("SALES_QUOTATION_CONVERT") && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          if (
                            confirm(`Convert ${record.quotationNumber} in POS?`)
                          )
                            navigate(
                              `/billing?quotationId=${record.quotationId}`,
                            );
                        }}
                      >
                        Convert to POS
                      </button>
                    )}
                  {record.convertedInvoiceId && (
                    <Link
                      className="btn btn-secondary"
                      to={`/sales?invoiceId=${record.convertedInvoiceId}`}
                    >
                      View converted invoice
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
