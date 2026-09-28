import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { customersApi } from "../../customers/api/customersApi";
import { locationsApi } from "../../locations/api/locationsApi";
import { invoicesApi } from "../api/invoicesApi";
import { InvoiceReceiptContent } from "./InvoiceReceiptContent";
import { downloadInvoiceReceipt } from "./invoiceReceiptPdf";
import { PaymentMethod, paymentMethodsApi } from "../api/paymentMethodsApi";

type SaleType = "Retail" | "Wholesale";
type Product = {
  productId: number;
  code: string;
  category: string;
  name: string;
  retailPrice: number;
  wholesalePrice: number;
  stock: number;
};
type CartLine = Product & {
  qty: number;
  discountPct: number;
  discountRs: number;
};

type CustomerOption = { customerId: number; code: string; name: string; phone: string };
type SplitPayment = { paymentMethodId: number; name: string; amount: number };

export function BillingPage() {
  const saleTypeSection = useRef<HTMLDivElement>(null);
  const productSection = useRef<HTMLDivElement>(null);
  const cartSection = useRef<HTMLDivElement>(null);
  const customerSection = useRef<HTMLDivElement>(null);
  const paymentSection = useRef<HTMLDivElement>(null);
  const paymentMethodSection = useRef<HTMLDivElement>(null);
  const receiptModal = useRef<HTMLDivElement>(null);
  const [saleType, setSaleType] = useState<SaleType>("Retail");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomer, setNewCustomer] = useState(false);
  const [method, setMethod] = useState("Cash");
  const [paid, setPaid] = useState("");
  const [locationId, setLocationId] = useState(0);
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([]);
  const [complete, setComplete] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Record<string, any> | null>(null);
  const locationsQuery = useQuery({ queryKey: ["locations"], queryFn: locationsApi.list });
  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: customersApi.list });
  const methodsQuery = useQuery({ queryKey: ["payment-methods"], queryFn: paymentMethodsApi.list });
  useEffect(() => { const first = (locationsQuery.data ?? []).find((x: any) => x.isActive !== false); if (!locationId && first) setLocationId(Number(first.locationId)); }, [locationsQuery.data, locationId]);
  const catalogQuery = useQuery({ queryKey: ["invoice-catalog", locationId], queryFn: () => invoicesApi.catalog(locationId), enabled: locationId > 0 });
  const products: Product[] = (catalogQuery.data ?? []).map((x) => ({ ...x, retailPrice: Number(x.retailPrice), wholesalePrice: Number(x.wholesalePrice), stock: Number(x.stock) }));
  const customers: CustomerOption[] = (customersQuery.data ?? []).filter((x: any) => x.isActive !== false).map((x: any) => ({ customerId: Number(x.customerId), code: x.customerCode, name: x.customerName, phone: x.phone ?? "" }));
  const paymentMethods = (methodsQuery.data ?? []).filter((x) => x.isActive);
  useEffect(() => { if (!method && paymentMethods[0]) setMethod(paymentMethods[0].paymentMethodName); }, [paymentMethods, method]);
  const unitPrice = (x: Product) =>
    saleType === "Retail" ? x.retailPrice : x.wholesalePrice;
  const lineGross = (x: CartLine) => x.qty * unitPrice(x);
  const lineDiscount = (x: CartLine) => x.discountRs;
  const lineNet = (x: CartLine) => Math.max(0, lineGross(x) - lineDiscount(x));
  const subtotal = useMemo(
    () => cart.reduce((n, x) => n + lineGross(x), 0),
    [cart, saleType],
  );
  const discount = useMemo(
    () => cart.reduce((n, x) => n + lineDiscount(x), 0),
    [cart, saleType],
  );
  const total = Math.max(0, subtotal - discount);
  const currentMethod = paymentMethods.find((x) => x.paymentMethodName === method);
  const paidTotal = splitPayments.reduce((sum, x) => sum + x.amount, 0) + (+paid || 0);
  const paymentStatus =
    paidTotal >= total && total > 0
      ? "Full Paid"
      : paidTotal > 0
        ? "Partially Paid"
        : "None Paid";
  const invoiceMutation = useMutation({
    mutationFn: () => invoicesApi.create({
      locationId,
      customerId: selectedCustomer?.customerId,
      saleType: saleType.toUpperCase() as "RETAIL" | "WHOLESALE",
      details: cart.map((x) => ({ productId: x.productId, quantity: x.qty, unitPrice: unitPrice(x), discountPercentage: x.discountPct, discountAmount: x.discountRs })),
      payments: [
        ...splitPayments.map((x) => ({ paymentMethodId: x.paymentMethodId, amount: x.amount })),
        ...(currentMethod && +paid > 0 ? [{ paymentMethodId: currentMethod.paymentMethodId, amount: +paid }] : []),
      ],
    }),
    onSuccess: (invoice) => { setCompletedInvoice(invoice); setComplete(true); },
  });
  const choosePaymentMethod = (paymentMethod: PaymentMethod) => {
    if (method !== paymentMethod.paymentMethodName && currentMethod && +paid > 0) {
      setSplitPayments((rows) => [...rows, { paymentMethodId: currentMethod.paymentMethodId, name: currentMethod.paymentMethodName, amount: +paid }]);
      setPaid("");
    }
    setMethod(paymentMethod.paymentMethodName);
  };
  const changeType = (type: SaleType) => {
    setSaleType(type);
    setPaid("");
    setCart((v) =>
      v.map((x) => {
        const discountPct = type === "Wholesale" ? 5 : 0;
        const price = type === "Retail" ? x.retailPrice : x.wholesalePrice;
        return {
          ...x,
          discountPct,
          discountRs: Number(((x.qty * price * discountPct) / 100).toFixed(2)),
        };
      }),
    );
  };
  const selectTypeWithPlus = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    type: SaleType,
  ) => {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      return;
    }
    if (event.key === "+" || event.key === "Add") {
      event.preventDefault();
      event.stopPropagation();
      changeType(type);
    }
  };
  const add = (p: Product) =>
    setCart((v) => {
      const found = v.find((x) => x.code === p.code);
      if (!((found?.qty ?? 0) + 1 <= p.stock)) return v;
      if (found) {
        const qty = found.qty + 1;
        const updated = {
          ...found,
          qty,
          discountRs: Number(
            ((qty * unitPrice(found) * found.discountPct) / 100).toFixed(2),
          ),
        };
        return [updated, ...v.filter((x) => x.code !== p.code)];
      }
      return [
        {
          ...p,
          qty: 1,
          discountPct: saleType === "Wholesale" ? 5 : 0,
          discountRs:
            saleType === "Wholesale"
              ? Number((p.wholesalePrice * 0.05).toFixed(2))
              : 0,
        },
        ...v,
      ];
    });
  const removeOne = (p: Product) =>
    setCart((v) =>
      v.flatMap((x) => {
        if (x.code !== p.code) return [x];
        if (x.qty <= 1) return [];
        const qty = x.qty - 1;
        return [
          {
            ...x,
            qty,
            discountRs: Number(
              ((qty * unitPrice(x) * x.discountPct) / 100).toFixed(2),
            ),
          },
        ];
      }),
    );
  const update = (
    code: string,
    key: "qty" | "discountPct" | "discountRs",
    value: number,
  ) =>
    setCart((v) =>
      v.map((x) => {
        if (x.code !== code) return x;
        const safe = Math.max(0, value);
        if (key === "qty") {
          const qty = safe;
          return {
            ...x,
            qty,
            discountRs: Number(
              ((qty * unitPrice(x) * x.discountPct) / 100).toFixed(2),
            ),
          };
        }
        const gross = lineGross(x);
        if (key === "discountPct") {
          const discountPct = Math.min(100, safe);
          return {
            ...x,
            discountPct,
            discountRs: Number(((gross * discountPct) / 100).toFixed(2)),
          };
        }
        const discountRs = Math.min(gross, safe);
        return {
          ...x,
          discountRs,
          discountPct: gross
            ? Number(((discountRs / gross) * 100).toFixed(2))
            : 0,
        };
      }),
    );
  const focusFirst = (section: HTMLDivElement | null) =>
    section?.querySelector<HTMLElement>("button,input,select")?.focus();
  const keepEnterInSection = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const preferred = event.currentTarget.querySelectorAll<HTMLElement>(
      "[data-enter-flow]:not(:disabled)",
    );
    const controls = Array.from(
      preferred.length
        ? preferred
        : event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not(:disabled),select:not(:disabled)",
          ),
    ).sort(
      (a, b) =>
        Number(a.dataset.flowOrder ?? 0) - Number(b.dataset.flowOrder ?? 0),
    );
    if (!controls.length) return;
    const current = controls.indexOf(document.activeElement as HTMLElement);
    controls[(current + 1) % controls.length].focus();
  };
  const navigateCart = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-cart-cell]",
    );
    if (!target) return;
    const row = Number(target.dataset.cartRow),
      column = Number(target.dataset.cartColumn);
    const focusCell = (nextRow: number, nextColumn: number) =>
      cartSection.current
        ?.querySelector<HTMLElement>(
          `[data-cart-row="${nextRow}"][data-cart-column="${nextColumn}"]`,
        )
        ?.focus();
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      focusCell(
        column === 3 ? Math.min(row + 1, cart.length - 1) : row,
        column === 3 ? 0 : column + 1,
      );
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(
        column === 0 ? Math.max(row - 1, 0) : row,
        column === 0 ? 3 : column - 1,
      );
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(Math.min(row + 1, cart.length - 1), column);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(Math.max(row - 1, 0), column);
    }
    if (
      event.key === "+" ||
      event.key === "Add" ||
      event.key === "-" ||
      event.key === "Subtract"
    ) {
      event.preventDefault();
      const line = cart[row];
      if (!line) return;
      if (column === 3) {
        if (event.key === "+" || event.key === "Add")
          setCart((v) => v.filter((x) => x.code !== line.code));
        return;
      }
      const key =
        column === 0 ? "qty" : column === 1 ? "discountPct" : "discountRs";
      const current = line[key];
      const direction = event.key === "+" || event.key === "Add" ? 1 : -1;
      update(
        line.code,
        key,
        key === "discountPct"
          ? Math.min(100, current + direction)
          : Math.max(0, current + direction),
      );
    }
  };
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        focusFirst(productSection.current);
      }
      if (event.key === "F2") {
        event.preventDefault();
        focusFirst(saleTypeSection.current);
      }
      if (event.key === "F3") {
        event.preventDefault();
        cartSection.current
          ?.querySelector<HTMLElement>("[data-cart-cell]")
          ?.focus();
      }
      if (event.key === "F4") {
        event.preventDefault();
        customerSection.current?.querySelector<HTMLElement>("input")?.focus();
      }
      if (event.key === "F5") {
        event.preventDefault();
        paymentMethodSection.current
          ?.querySelector<HTMLElement>("[data-payment-method]")
          ?.focus();
      }
      if (event.key === "F6") {
        event.preventDefault();
        focusFirst(paymentSection.current);
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, []);
  const outputReceipt = (printOnly = false) => {
    if (printOnly) window.print();
    else if (completedInvoice) downloadInvoiceReceipt(completedInvoice);
  };
  const resetSale = () => {
    setComplete(false);
    setSaleType("Retail");
    setCart([]);
    setQuery("");
    setCategory("All categories");
    setCustomerQuery("");
    setSelectedCustomer(null);
    setNewCustomer(false);
    setMethod("Cash");
    setPaid("");
    setSplitPayments([]);
    setCompletedInvoice(null);
    setTimeout(
      () =>
        focusFirst(productSection.current),
      0,
    );
  };
  const navigateReceipt = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const actions = Array.from(
      receiptModal.current?.querySelectorAll<HTMLButtonElement>(
        "[data-receipt-action]",
      ) ?? [],
    );
    const current = actions.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Enter") {
      event.preventDefault();
      actions[(current + 1) % actions.length]?.focus();
    }
    if (event.key === "+" || event.key === "Add") {
      event.preventDefault();
      actions[current]?.click();
    }
    if (event.key === " ") {
      event.preventDefault();
    }
  };

  return (
    <div className="pos-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">SALES / POINT OF SALE</div>
          <h1>Billing</h1>
          <p>
            Create a retail or wholesale bill, receive payment and complete the
            sale.
          </p>
        </div>
        <div className="pos-bill-number">
          <small>Current bill</small>
          <strong>{completedInvoice?.invoiceNumber ?? "New invoice"}</strong>
        </div>
      </div>
      <div className="pos-layout">
        <section className="pos-workspace">
          <div className="card billing-location-section"><div><h2>Location</h2><p>Select the stock location used for this invoice.</p></div><select className="control" value={locationId || ""} onChange={(event) => { setLocationId(Number(event.target.value)); setCart([]); }}><option value="">Select location</option>{(locationsQuery.data ?? []).filter((x: any) => x.isActive !== false).map((x: any) => <option key={x.locationId} value={x.locationId}>{x.name}</option>)}</select></div>
          <div
            ref={saleTypeSection}
            onKeyDown={keepEnterInSection}
            className="card sale-type-section"
          >
            <div className="sale-type-heading">
              <span>F2</span>
              <div>
                <h2>Sale Type</h2>
                <p>Enter moves focus · Press + to select the focused type.</p>
              </div>
            </div>
            <div className="sale-type-options">
              <button
                className={saleType === "Retail" ? "active" : ""}
                onKeyDown={(event) => selectTypeWithPlus(event, "Retail")}
                onClick={() => changeType("Retail")}
              >
                <span>▤</span>
                <b>Retail</b>
                <small>Standard selling price</small>
              </button>
              <button
                className={saleType === "Wholesale" ? "active" : ""}
                onKeyDown={(event) => selectTypeWithPlus(event, "Wholesale")}
                onClick={() => changeType("Wholesale")}
              >
                <span>▦</span>
                <b>Wholesale</b>
                <small>Wholesale price + default discount</small>
              </button>
            </div>
            <div className="sale-type-current">
              <small>Selected</small>
              <strong>{saleType} Sale</strong>
            </div>
          </div>
          <div
            ref={productSection}
            onKeyDown={keepEnterInSection}
            className="card pos-product-picker"
          >
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="section-number">F1</span> Add products
                </h2>
                <p>
                  Press F1 to search · Enter moves directly through the products
                  below.
                </p>
              </div>
            </div>
            <div className="pos-search-row">
              <div className="sales-search">
                <span>⌕</span>
                <input
                  autoFocus
                  data-enter-flow
                  data-flow-order="0"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter item code or product name..."
                />
              </div>
              <select
                data-enter-flow
                data-flow-order="1000"
                className="control"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>All categories</option>
                <option>Bread</option>
                <option>Pastry</option>
                <option>Cake</option>
                <option>Buns</option>
              </select>
              <button
                data-enter-flow
                data-flow-order="1001"
                className="btn btn-secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("All categories");
                }}
              >
                Clear
              </button>
            </div>
            {query.trim() || category !== "All categories" ? (
              <div className="pos-product-results">
                {products
                  .filter(
                    (x) =>
                      (category === "All categories" ||
                        x.category === category) &&
                      `${x.code} ${x.name}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((p, index) => {
                    const quantity =
                      cart.find((x) => x.code === p.code)?.qty ?? 0;
                    const available = Math.max(0, p.stock - quantity);
                    const canAdd = available >= 1;
                    return (
                      <div
                        data-enter-flow
                        data-flow-order={10 + index}
                        tabIndex={0}
                        onClick={() => add(p)}
                        onKeyDown={(event) => {
                          if (event.key === "+" || event.key === "Add") {
                            event.preventDefault();
                            event.stopPropagation();
                            add(p);
                          }
                          if (event.key === "-" || event.key === "Subtract") {
                            event.preventDefault();
                            event.stopPropagation();
                            removeOne(p);
                          }
                        }}
                        className="pos-product-item"
                        key={p.code}
                      >
                        <span className="product-dot">{p.name[0]}</span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.code} · {p.category} · {available} available
                          </small>
                        </span>
                        <span className="product-sale-price">
                          <b>LKR {unitPrice(p).toLocaleString()}</b>
                          <small>
                            {quantity ? `${quantity} in cart · ` : ""}
                            {canAdd
                              ? "Click or keyboard + / −"
                              : "No more available"}
                          </small>
                        </span>
                      </div>
                    );
                  })}
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
          </div>
          <div
            ref={cartSection}
            onKeyDown={navigateCart}
            className="card pos-cart"
          >
            <div className="sales-card-head">
              <div>
                <h2>
                  <span className="section-number">F3</span> Sale items{" "}
                  <span className="code-chip">{cart.length} items</span>
                </h2>
                <p>
                  Arrow keys move around items · Enter moves next · + / −
                  changes values.
                </p>
              </div>
          <button className="btn btn-secondary" onClick={() => setCart([])}>
            Clear cart
          </button>
            </div>
            <div className="sales-table-wrap">
              <table className="table pos-cart-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item code</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th className="right">Price</th>
                    <th>Discount (%)</th>
                    <th>Discount (Rs)</th>
                    <th className="right">Gross Total</th>
                    <th className="right">Net Total</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((x, i) => (
                    <tr key={x.code}>
                      <td>{i + 1}</td>
                      <td>
                        <span className="code-chip">{x.code}</span>
                      </td>
                      <td>
                        <strong>{x.name}</strong>
                      </td>
                      <td>
                        <input
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="0"
                          className="control pos-small-input"
                          type="number"
                          min="0"
                          value={x.qty || ""}
                          placeholder="0"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            update(
                              x.code,
                              "qty",
                              e.target.value === "" ? 0 : +e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="right">{unitPrice(x).toLocaleString()}</td>
                      <td>
                        <input
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="1"
                          className="control pos-small-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={x.discountPct || ""}
                          placeholder="0"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            update(
                              x.code,
                              "discountPct",
                              e.target.value === "" ? 0 : +e.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="2"
                          className="control pos-discount-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={x.discountRs || ""}
                          placeholder="0.00"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) =>
                            update(
                              x.code,
                              "discountRs",
                              e.target.value === "" ? 0 : +e.target.value,
                            )
                          }
                        />
                      </td>
                      <td className="right">{lineGross(x).toLocaleString()}</td>
                      <td className="right">
                        <strong>LKR {lineNet(x).toLocaleString()}</strong>
                      </td>
                      <td>
                        <button
                          data-cart-cell
                          data-cart-row={i}
                          data-cart-column="3"
                          className="sales-more cart-remove"
                          onClick={() =>
                            setCart((v) => v.filter((y) => y.code !== x.code))
                          }
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cart.length && (
                <div className="empty">
                  No items in this sale. Select a product above.
                </div>
              )}
            </div>
          </div>
        </section>
        <aside className="pos-checkout">
          <div
            ref={customerSection}
            onKeyDown={keepEnterInSection}
            className="card pos-customer"
          >
            <div className="pos-panel-title">
              <h2>
                <span className="panel-shortcut">F4</span> Customer
              </h2>
              <div className="customer-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setNewCustomer(true);
                    setSelectedCustomer(null);
                    setCustomerQuery("");
                  }}
                >
                  + New
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setNewCustomer(false);
                    setSelectedCustomer(null);
                    setCustomerQuery("");
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
            <label className="customer-search-label">
              Customer Code / Tel / Name
            </label>
            <div className="sales-search customer-search">
              <span>⌕</span>
              <input
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSelectedCustomer(null);
                  setNewCustomer(false);
                }}
                placeholder="Search customer..."
              />
            </div>
            {customerQuery && !selectedCustomer && (
              <div className="customer-results">
                {customers
                  .filter((x) =>
                    `${x.code} ${x.phone} ${x.name}`
                      .toLowerCase()
                      .includes(customerQuery.toLowerCase()),
                  )
                  .map((x) => (
                    <button
                      key={x.code}
                      onClick={() => {
                        setSelectedCustomer(x);
                        setCustomerQuery(x.code);
                      }}
                    >
                      <span>
                        <strong>{x.name}</strong>
                        <small>
                          {x.code} · {x.phone}
                        </small>
                      </span>
                      <b>+</b>
                    </button>
                  ))}
              </div>
            )}
            {selectedCustomer && (
              <div className="selected-customer">
                <span>{selectedCustomer.name[0]}</span>
                <div>
                  <strong>{selectedCustomer.name}</strong>
                  <small>
                    {selectedCustomer.code} · {selectedCustomer.phone}
                  </small>
                </div>
              </div>
            )}
            {newCustomer && (
              <div className="pos-customer-fields new-customer-fields">
                <input className="control" placeholder="Customer code" />
                <input className="control" placeholder="Telephone" />
                <input
                  className="control customer-name-field"
                  placeholder="Customer name"
                />
              </div>
            )}
          </div>
          <div
            ref={paymentMethodSection}
            onKeyDown={keepEnterInSection}
            className="card pos-payment-method"
          >
            <div className="pos-panel-title">
              <h2>
                <span className="panel-shortcut">F5</span> Payment Method
              </h2>
            </div>
            <div className="pos-methods">
              {paymentMethods.map((x) => (
                <button
                  data-enter-flow
                  data-payment-method
                  className={method === x.paymentMethodName ? "active" : ""}
                  onKeyDown={(event) => {
                    if (event.key === "+" || event.key === "Add") {
                      event.preventDefault();
                      event.stopPropagation();
                      choosePaymentMethod(x);
                    }
                    if (event.key === " ") {
                      event.preventDefault();
                    }
                  }}
                  onClick={() => choosePaymentMethod(x)}
                  key={x.paymentMethodId}
                >
                  <span>◇</span>
                  {x.paymentMethodName}
                </button>
              ))}
            </div>
          </div>
          <div className="card pos-summary">
            <div className="pos-panel-title">
              <h2>Cart Summary</h2>
            </div>
            <div className="summary-line">
              <span>Items</span>
              <b>{cart.reduce((n, x) => n + x.qty, 0)} units</b>
            </div>
            <div className="summary-line">
              <span>Subtotal</span>
              <b>LKR {subtotal.toLocaleString()}</b>
            </div>
            <div className="summary-line">
              <span>Total discount</span>
              <b>- LKR {discount.toLocaleString()}</b>
            </div>
            <div className="summary-total">
              <span>Grand Total</span>
              <strong>LKR {total.toLocaleString()}</strong>
            </div>
          </div>
          <div
            ref={paymentSection}
            onKeyDown={keepEnterInSection}
            className="card pos-payment"
          >
            <div className="pos-panel-title">
              <h2>
                <span className="panel-shortcut">F6</span> Payment
              </h2>
            </div>
            <div className="pos-pay-status">
              <span className={paymentStatus === "Full Paid" ? "active full" : ""}>
                <i />
                Full Paid
              </span>
              <span
                className={paymentStatus === "Partially Paid" ? "active partial" : ""}
              >
                <i />
                Partially Paid
              </span>
              <span className={paymentStatus === "None Paid" ? "active none" : ""}>
                <i />
                None Paid
              </span>
            </div>
            {splitPayments.length > 0 && <div className="split-payment-list">{splitPayments.map((payment, index) => <div key={`${payment.paymentMethodId}-${index}`}><span>{payment.name}</span><b>LKR {payment.amount.toLocaleString()}</b><button type="button" onClick={() => setSplitPayments((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>×</button></div>)}</div>}
            <label>
              {method} amount
              <div className="money-input">
                <span>LKR</span>
                <input
                  className="control"
                  type="number"
                  value={paid}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setPaid(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </label>
            <div className="pos-balance">
              <span>{paidTotal >= total ? "Change" : "Balance Due"}</span>
              <strong>
                LKR {Math.abs(total - paidTotal).toLocaleString()}
              </strong>
            </div>
            <div className="payment-finish">
              <button
                className="pos-complete"
                disabled={!cart.length || !currentMethod || !locationId || invoiceMutation.isPending}
                onClick={() => invoiceMutation.mutate()}
              >
                ✓ Complete Sale
              </button>
            </div>
            {invoiceMutation.isError && <div className="error-box">{(invoiceMutation.error as Error).message}</div>}
          </div>
        </aside>
      </div>
      {complete && (
        <div className="modal-bg">
          <div
            ref={receiptModal}
            onKeyDown={navigateReceipt}
            className="modal pos-success"
          >
            <button
              data-receipt-action
              className="receipt-close"
              onClick={resetSale}
              aria-label="Close receipt and reset sale"
            >
              ✕
            </button>
            <span>✓</span>
            <h2>Sale completed</h2>
            <p>
              {completedInvoice?.invoiceNumber} · {saleType} · {method} · LKR{" "}
              {total.toLocaleString()}
            </p>
            {completedInvoice && <InvoiceReceiptContent invoice={completedInvoice} />}
            <div className="modal-foot receipt-actions">
              <button
                autoFocus
                data-receipt-action
                className="btn btn-secondary"
                onClick={() => outputReceipt(true)}
              >
                ▣ Print Receipt
              </button>
              <button
                data-receipt-action
                className="btn btn-secondary"
                onClick={() => outputReceipt(false)}
              >
                ⇩ Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
