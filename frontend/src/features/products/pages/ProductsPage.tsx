import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api/productsApi";
import { categoriesApi } from "../../categories/api/categoriesApi";
import { brandsApi } from "../../brands/api/brandsApi";
import { unitsApi } from "../../units/api/unitsApi";
import { identifierTypesApi } from "../../identifier-types/api/identifier-typesApi";
import { priceListsApi } from "../../price-lists/api/price-listsApi";
import { locationsApi } from "../../locations/api/locationsApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { Modal } from "../../../components/ui/Modal";
import { Field } from "../../../components/ui/Field";
import { Section } from "../../../components/ui/Section";
import { attributesApi } from "../../attributes/api/attributesApi";
import { useAuth } from "../../auth/AuthContext";

type ProductForm = {
  sku: string;
  productName: string;
  description: string;
  productType: string;
  categoryId: string;
  brandId: string;
  baseUnitId: string;
  isSellable: boolean;
  isPurchasable: boolean;
  isStockItem: boolean;
  trackBatch: boolean;
  trackExpiry: boolean;
  trackSerial: boolean;
};
type Identifier = {
  identifierTypeId: string;
  identifierValue: string;
  isPrimary: boolean;
};
type PUnit = {
  unitId: string;
  conversionFactor: string;
  isBaseUnit: boolean;
  isPurchaseUnit: boolean;
  isSalesUnit: boolean;
};
type Price = {
  priceListId: string;
  unitId: string;
  sellingPrice: string;
  minimumQuantity: string;
  effectiveFrom: string;
};
type Location = {
  locationId: string;
  isSellable: boolean;
  isPurchasable: boolean;
};
type SupplierPrice = {
  supplierId: string;
  unitId: string;
  purchasePrice: string;
  currencyCode: string;
  minimumQuantity: string;
  effectiveFrom: string;
};
type ProductAttribute = { attributeId: string; value: string };

const id = (r: any, key: string) => r?.[key] ?? r?.id;
const emptyProduct = (): ProductForm => ({
  sku: "",
  productName: "",
  description: "",
  productType: "STOCK",
  categoryId: "",
  brandId: "",
  baseUnitId: "",
  isSellable: true,
  isPurchasable: true,
  isStockItem: true,
  trackBatch: false,
  trackExpiry: false,
  trackSerial: false,
});

export function ProductsPage() {
  const { permissions } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProductForm>(emptyProduct());
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [productUnits, setProductUnits] = useState<PUnit[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<SupplierPrice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [productAttributes, setProductAttributes] = useState<
    ProductAttribute[]
  >([]);
  const [mode, setMode] = useState<"create" | "update">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [updatePickerOpen, setUpdatePickerOpen] = useState(false);
  const [updateSearch, setUpdateSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const [viewing, setViewing] = useState<any>(null);
  const [confirming, setConfirming] = useState<any>(null);

  const products = useQuery({
    queryKey: ["products", page, limit, debouncedSearch, statusFilter],
    queryFn: () =>
      productsApi.page({
        page,
        limit,
        search: debouncedSearch,
        status: statusFilter,
      }),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesApi.list,
  });
  const brands = useQuery({ queryKey: ["brands"], queryFn: brandsApi.list });
  const units = useQuery({ queryKey: ["units"], queryFn: unitsApi.list });
  const identifierTypes = useQuery({
    queryKey: ["identifier-types"],
    queryFn: identifierTypesApi.list,
  });
  const priceLists = useQuery({
    queryKey: ["price-lists"],
    queryFn: priceListsApi.list,
  });
  const locationsQ = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.list,
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: suppliersApi.list,
  });
  const attributes = useQuery({
    queryKey: ["attributes"],
    queryFn: attributesApi.list,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const rows = products.data?.items ?? [];

  const categoryOptions = (categories.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "categoryId"),
      label: r.categoryName ?? r.name,
    }));
  const brandOptions = (brands.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "brandId"),
      label: r.brandName ?? r.name,
    }));
  const unitOptions = (units.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "unitId"),
      label: `${r.name ?? r.unitName} (${r.symbol ?? r.code ?? ""})`,
    }));
  const identifierTypeOptions = (identifierTypes.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "identifierTypeId"),
      label: r.name ?? r.code,
    }));
  const priceListOptions = (priceLists.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "priceListId"),
      label: r.name ?? r.code,
    }));
  const locationOptions = (locationsQ.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, "locationId"), label: r.name ?? r.code }));
  const supplierOptions = (suppliers.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "supplierId"),
      label: `${r.supplierName ?? r.name} (${r.supplierCode ?? r.code ?? ""})`,
    }));
  const attributeOptions = (attributes.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "attributeId"),
      label: r.name ?? r.code,
    }));

  const reset = () => {
    setMode("create");
    setEditingId(null);
    setForm(emptyProduct());
    setIdentifiers([]);
    setProductUnits([]);
    setPrices([]);
    setSupplierPrices([]);
    setLocations([]);
    setProductAttributes([]);
    setStep(0);
    setError("");
    setOpen(true);
  };

  const addIdentifier = () =>
    setIdentifiers([
      ...identifiers,
      {
        identifierTypeId: "",
        identifierValue: "",
        isPrimary: identifiers.length === 0,
      },
    ]);
  const addUnit = () =>
    setProductUnits([
      ...productUnits,
      {
        unitId: "",
        conversionFactor: "1",
        isBaseUnit: false,
        isPurchaseUnit: false,
        isSalesUnit: true,
      },
    ]);
  const addPrice = () =>
    setPrices([
      ...prices,
      {
        priceListId: "",
        unitId: "",
        sellingPrice: "",
        minimumQuantity: "1",
        effectiveFrom: new Date().toISOString().slice(0, 16),
      },
    ]);
  const addSupplierPrice = () =>
    setSupplierPrices([
      ...supplierPrices,
      {
        supplierId: "",
        unitId: "",
        purchasePrice: "",
        currencyCode: "LKR",
        minimumQuantity: "1",
        effectiveFrom: new Date().toISOString().slice(0, 16),
      },
    ]);
  const addLocation = () =>
    setLocations([
      ...locations,
      { locationId: "", isSellable: true, isPurchasable: true },
    ]);
  const addAttribute = () =>
    setProductAttributes([
      ...productAttributes,
      { attributeId: "", value: "" },
    ]);

  const validGeneral = Boolean(
    form.productName.trim() && form.categoryId && form.baseUnitId,
  );
  const validUnits =
    productUnits.length > 0 &&
    productUnits.every((x) => x.unitId && Number(x.conversionFactor) > 0);
  const validPrices =
    prices.length > 0 &&
    prices.every(
      (x) => x.priceListId && x.unitId && Number(x.sellingPrice) > 0,
    );
  const validSupplierPrices =
    supplierPrices.length > 0 &&
    supplierPrices.every(
      (x) => x.supplierId && x.unitId && Number(x.purchasePrice) > 0,
    );
  const validLocations =
    locations.length > 0 && locations.every((x) => x.locationId);
  const validIdentifiers = identifiers.every(
    (x) => x.identifierTypeId && x.identifierValue.trim(),
  );
  const validAttributes = productAttributes.every(
    (x) => x.attributeId && x.value.trim(),
  );
  const setupValid =
    validGeneral &&
    validUnits &&
    validPrices &&
    validSupplierPrices &&
    validLocations &&
    validIdentifiers &&
    validAttributes;

  const selectForUpdate = async (productId: number) => {
    setBusy(true);
    try {
      const product: any = await productsApi.get(productId);
      setMode("update");
      setEditingId(productId);
      setForm({
        sku: product.sku ?? "",
        productName: product.productName ?? "",
        description: product.description ?? "",
        productType: product.productType ?? "STOCK",
        categoryId: String(product.categoryId ?? ""),
        brandId: String(product.brandId ?? ""),
        baseUnitId: String(product.baseUnitId ?? ""),
        isSellable: product.isSellable !== false,
        isPurchasable: product.isPurchasable !== false,
        isStockItem: product.isStockItem !== false,
        trackBatch: Boolean(product.trackBatch),
        trackExpiry: Boolean(product.trackExpiry),
        trackSerial: Boolean(product.trackSerial),
      });
      setIdentifiers(
        (product.identifiers ?? []).map((x: any) => ({
          identifierTypeId: String(x.identifierTypeId),
          identifierValue: x.identifierValue,
          isPrimary: Boolean(x.isPrimary),
        })),
      );
      setProductUnits(
        (product.productUnits ?? []).map((x: any) => ({
          unitId: String(x.unitId),
          conversionFactor: String(x.conversionFactor),
          isBaseUnit: Boolean(x.isBaseUnit),
          isPurchaseUnit: Boolean(x.isPurchaseUnit),
          isSalesUnit: Boolean(x.isSalesUnit),
        })),
      );
      setPrices(
        (product.priceListItems ?? []).map((x: any) => ({
          priceListId: String(x.priceListId),
          unitId: String(x.unitId),
          sellingPrice: String(x.sellingPrice),
          minimumQuantity: String(x.minimumQuantity),
          effectiveFrom: new Date(x.effectiveFrom).toISOString().slice(0, 16),
        })),
      );
      setSupplierPrices(
        (product.productSuppliers ?? []).flatMap((link: any) =>
          (link.prices ?? []).map((x: any) => ({
            supplierId: String(link.supplierId),
            unitId: String(
              x.productUnit?.unitId ?? link.purchaseUnit?.unitId ?? "",
            ),
            purchasePrice: String(x.purchasePrice),
            currencyCode: x.currencyCode ?? "LKR",
            minimumQuantity: String(x.minimumQuantity),
            effectiveFrom: new Date(x.effectiveFrom).toISOString().slice(0, 16),
          })),
        ),
      );
      setLocations(
        (product.productLocations ?? []).map((x: any) => ({
          locationId: String(x.locationId),
          isSellable: Boolean(x.isSellable),
          isPurchasable: Boolean(x.isPurchasable),
        })),
      );
      setProductAttributes(
        (product.productAttributes ?? []).map((x: any) => ({
          attributeId: String(x.attributeId),
          value: x.value,
        })),
      );
      setStep(0);
      setUpdatePickerOpen(false);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const viewProduct = async (productId: number) => {
    setBusy(true);
    setError("");
    try {
      setViewing(await productsApi.get(productId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    if (!confirming) return;
    setBusy(true);
    setError("");
    try {
      if (confirming.isActive !== false)
        await productsApi.deactivate(Number(id(confirming, "productId")));
      else await productsApi.activate(Number(id(confirming, "productId")));
      setConfirming(null);
      await qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!setupValid) {
      setError(
        !validPrices
          ? "At least one selling price is required."
          : !validSupplierPrices
            ? "At least one supplier purchase price is required."
            : !validLocations
              ? "At least one location is required."
              : !validUnits
                ? "At least one valid product unit is required."
                : !validIdentifiers
                  ? "Complete or remove invalid identifier rows."
                  : !validAttributes
                    ? "Complete or remove invalid attribute rows."
                    : "Complete all required general information.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { sku, ...productForm } = form;
      const payload = {
        ...productForm,
        ...(mode === "update" ? { sku } : {}),
        categoryId: Number(form.categoryId),
        brandId: form.brandId ? Number(form.brandId) : undefined,
        baseUnitId: Number(form.baseUnitId),
        identifiers: identifiers.map((x) => ({
          ...x,
          identifierTypeId: Number(x.identifierTypeId),
        })),
        productUnits: productUnits.map((x) => ({
          ...x,
          unitId: Number(x.unitId),
          conversionFactor: Number(x.conversionFactor),
        })),
        prices: prices.map((x) => ({
          ...x,
          priceListId: Number(x.priceListId),
          unitId: Number(x.unitId),
          sellingPrice: Number(x.sellingPrice),
          minimumQuantity: Number(x.minimumQuantity || 1),
        })),
        supplierPrices: supplierPrices.map((x) => ({
          ...x,
          supplierId: Number(x.supplierId),
          unitId: Number(x.unitId),
          purchasePrice: Number(x.purchasePrice),
          minimumQuantity: Number(x.minimumQuantity || 1),
        })),
        locations: locations.map((x) => ({
          ...x,
          locationId: Number(x.locationId),
        })),
        productAttributes: productAttributes.map((x) => ({
          ...x,
          attributeId: Number(x.attributeId),
        })),
      };
      if (mode === "update" && editingId)
        await productsApi.update(editingId, payload);
      else await productsApi.create(payload);
      await qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    "General",
    "Identifiers",
    "Units",
    "Pricing",
    "Locations",
    "Attributes",
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">PRODUCT MASTER</div>
          <h1>Products</h1>
          <p>
            Manage products with identifiers, packaging, pricing and location
            setup.
          </p>
        </div>
        <div>
          {permissions.includes("PRODUCT_UPDATE") && (
            <button
              className="btn btn-secondary"
              onClick={() => setUpdatePickerOpen(true)}
            >
              Update Product
            </button>
          )}{" "}
          {permissions.includes("PRODUCT_CREATE") && (
            <button className="btn btn-primary" onClick={reset}>
              ＋ Create product
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {products.error && (
          <div className="error-box">{(products.error as Error).message}</div>
        )}
        <div className="toolbar">
          <div className="search-wrap">
            <span>⌕</span>
            <input
              className="input search"
              placeholder="Search SKU or product name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="control"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => products.refetch()}
          >
            ↻ Refresh
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Base unit</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.isLoading ? (
              <tr>
                <td colSpan={6}>Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty">No products found.</div>
                </td>
              </tr>
            ) : (
              rows.map((r: any) => (
                <tr key={id(r, "productId")}>
                  <td>
                    <div className="primary-cell">
                      <span className="product-dot">P</span>
                      <div>
                        <strong>{r.productName}</strong>
                        <small>{r.description ?? "Product master"}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="code-chip">{r.sku}</span>
                  </td>
                  <td>
                    {r.category?.categoryName ??
                      r.category?.name ??
                      r.categoryName ??
                      r.categoryId ??
                      "—"}
                  </td>
                  <td>
                    {r.baseUnit?.name ??
                      r.baseUnit?.code ??
                      r.baseUnitId ??
                      "—"}
                  </td>
                  <td>
                    <span
                      className={
                        r.isActive !== false
                          ? "status status-on"
                          : "status status-off"
                      }
                    >
                      <i /> {r.isActive !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="right">
                    {permissions.includes("PRODUCT_VIEW") && (
                      <button
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => viewProduct(Number(id(r, "productId")))}
                      >
                        View
                      </button>
                    )}{" "}
                    {permissions.includes("PRODUCT_UPDATE") && (
                      <button
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() =>
                          selectForUpdate(Number(id(r, "productId")))
                        }
                      >
                        Edit
                      </button>
                    )}{" "}
                    {permissions.includes("PRODUCT_DEACTIVATE") && (
                      <button
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => setConfirming(r)}
                      >
                        {r.isActive !== false ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="toolbar">
          <span>
            Showing {products.data?.total ? (page - 1) * limit + 1 : 0}–
            {Math.min(page * limit, products.data?.total ?? 0)} of{" "}
            {products.data?.total ?? 0} products
          </span>
          <div>
            <button
              className="btn btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>{" "}
            {Array.from(
              { length: products.data?.totalPages ?? 1 },
              (_, index) => index + 1,
            )
              .filter(
                (number) =>
                  number === 1 ||
                  number === products.data?.totalPages ||
                  Math.abs(number - page) <= 1,
              )
              .map((number, index, visible) => (
                <span key={number}>
                  {index > 0 && number - visible[index - 1] > 1 ? " … " : " "}
                  <button
                    className={
                      number === page ? "btn btn-primary" : "btn btn-secondary"
                    }
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                </span>
              ))}{" "}
            <button
              className="btn btn-secondary"
              disabled={page >= (products.data?.totalPages ?? 1)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>{" "}
            <select
              className="control"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
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

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="Product Details"
        subtitle={viewing ? `${viewing.sku} — ${viewing.productName}` : ""}
        wide
      >
        {viewing && (
          <div className="modal-body product-body">
            <Section title="General" description="Product master information.">
              <div className="form-grid">
                <Field
                  label="SKU"
                  value={viewing.sku}
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Product Name"
                  value={viewing.productName}
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Category"
                  value={
                    viewing.category?.categoryName ??
                    viewing.category?.name ??
                    "—"
                  }
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Brand"
                  value={viewing.brand?.brandName ?? viewing.brand?.name ?? "—"}
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Base Unit"
                  value={
                    viewing.baseUnit?.name ?? viewing.baseUnit?.code ?? "—"
                  }
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Product Type"
                  value={viewing.productType}
                  onChange={() => {}}
                  disabled
                />
              </div>
            </Section>
            <Section
              title="Identifiers"
              description="Assigned product identifiers."
            >
              {(viewing.identifiers ?? []).map((x: any) => (
                <div className="mini-row" key={x.productIdentifierId}>
                  <span>
                    {x.identifierType?.name ?? x.identifierType?.code}
                  </span>
                  <strong>{x.identifierValue}</strong>
                </div>
              ))}
              {!(viewing.identifiers ?? []).length && (
                <div className="empty">No identifiers.</div>
              )}
            </Section>
            <Section
              title="Units"
              description="Packaging and conversion units."
            >
              {(viewing.productUnits ?? []).map((x: any) => (
                <div className="mini-row" key={x.productUnitId}>
                  <span>{x.unit?.name ?? x.unit?.code}</span>
                  <span>Conversion: {x.conversionFactor}</span>
                  <span>
                    {x.isPurchaseUnit ? "Purchase" : ""}{" "}
                    {x.isSalesUnit ? "Sales" : ""}
                  </span>
                </div>
              ))}
            </Section>
            <Section
              title="Selling Prices"
              description="Active price-list configuration."
            >
              {(viewing.priceListItems ?? []).map((x: any) => (
                <div className="mini-row" key={x.priceListItemId}>
                  <span>{x.priceList?.name ?? x.priceList?.code}</span>
                  <span>{x.unit?.name ?? x.unit?.code}</span>
                  <strong>{x.sellingPrice}</strong>
                </div>
              ))}
            </Section>
            <Section
              title="Supplier / Purchase Prices"
              description="Supplier costing configuration."
            >
              {(viewing.productSuppliers ?? []).flatMap((link: any) =>
                (link.prices ?? []).map((x: any) => (
                  <div className="mini-row" key={x.productSupplierPriceId}>
                    <span>
                      {link.supplier?.supplierName ?? link.supplier?.name}
                    </span>
                    <span>
                      {x.productUnit?.unit?.name ??
                        link.purchaseUnit?.unit?.name}
                    </span>
                    <strong>
                      {x.currencyCode} {x.purchasePrice}
                    </strong>
                  </div>
                )),
              )}
            </Section>
            <Section
              title="Locations"
              description="Product availability by location."
            >
              {(viewing.productLocations ?? []).map((x: any) => (
                <div className="mini-row" key={x.productLocationId}>
                  <span>{x.location?.name ?? x.location?.code}</span>
                  <span>{x.isActive !== false ? "Active" : "Inactive"}</span>
                  <span>
                    {x.isSellable ? "Sellable" : ""}{" "}
                    {x.isPurchasable ? "Purchasable" : ""}
                  </span>
                </div>
              ))}
            </Section>
            <Section title="Attributes" description="Product characteristics.">
              {(viewing.productAttributes ?? []).map((x: any) => (
                <div className="mini-row" key={x.productAttributeId}>
                  <span>{x.attribute?.name ?? x.attribute?.code}</span>
                  <strong>{x.value}</strong>
                </div>
              ))}
              {!(viewing.productAttributes ?? []).length && (
                <div className="empty">No attributes.</div>
              )}
            </Section>
          </div>
        )}
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={() => setViewing(null)}
          >
            Close
          </button>
          {permissions.includes("PRODUCT_UPDATE") && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const productId = Number(id(viewing, "productId"));
                setViewing(null);
                selectForUpdate(productId);
              }}
            >
              Edit
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        onClose={() => !busy && setConfirming(null)}
        title={
          confirming?.isActive !== false
            ? "Deactivate Product"
            : "Activate Product"
        }
      >
        <div className="modal-body">
          <p>
            {confirming?.isActive !== false
              ? `Deactivate product ${confirming?.sku} — ${confirming?.productName}? The product will remain in historical transactions but will no longer be available for normal new operations.`
              : `Activate product ${confirming?.sku} — ${confirming?.productName}?`}
          </p>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setConfirming(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={toggleActive}
          >
            {confirming?.isActive !== false ? "Deactivate" : "Activate"}
          </button>
        </div>
      </Modal>

      <Modal
        open={updatePickerOpen}
        onClose={() => setUpdatePickerOpen(false)}
        title="Update Product"
        subtitle="Search by SKU or product name."
        wide
      >
        <div className="modal-body">
          <input
            className="control"
            placeholder="Search by SKU or Product Name..."
            value={updateSearch}
            onChange={(e) => setUpdateSearch(e.target.value)}
          />
          <div className="mini-table" style={{ marginTop: 16 }}>
            <div
              className="mini-head"
              style={{ gridTemplateColumns: "1fr 2fr 100px" }}
            >
              <span>SKU</span>
              <span>Product</span>
              <span />
            </div>
            {rows
              .filter((x: any) =>
                `${x.sku ?? ""} ${x.productName ?? ""}`
                  .toLowerCase()
                  .includes(updateSearch.toLowerCase()),
              )
              .map((x: any) => (
                <div
                  className="mini-row"
                  style={{ gridTemplateColumns: "1fr 2fr 100px" }}
                  key={id(x, "productId")}
                >
                  <span>{x.sku}</span>
                  <strong>{x.productName}</strong>
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => selectForUpdate(Number(id(x, "productId")))}
                  >
                    Select
                  </button>
                </div>
              ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={mode === "update" ? "Update Product" : "Create Product"}
        subtitle="Set up the product master and its related commercial configuration."
        wide
      >
        <div className="wizard-tabs">
          {steps.map((s, i) => (
            <button
              key={s}
              className={step === i ? "wizard-tab active" : "wizard-tab"}
              onClick={() => setStep(i)}
              type="button"
            >
              <span>{i + 1}</span>
              {s}
            </button>
          ))}
        </div>
        <div className="modal-body product-body">
          {step === 0 && (
            <>
              <Section
                title="Basic information"
                description="The core identity used across purchasing, inventory and POS."
              >
                <div className="form-grid">
                  <Field
                    label="SKU"
                    value={
                      mode === "create" ? "Generated automatically" : form.sku
                    }
                    onChange={(v) => setForm({ ...form, sku: v })}
                    required={mode === "update"}
                    disabled={mode === "create"}
                    hint={
                      mode === "create"
                        ? "SKU is generated when the product is created."
                        : undefined
                    }
                  />
                  <Field
                    label="Product name"
                    value={form.productName}
                    onChange={(v) => setForm({ ...form, productName: v })}
                    required
                    placeholder="Coca-Cola 500ml"
                  />
                  <Field
                    label="Category"
                    value={form.categoryId}
                    onChange={(v) => setForm({ ...form, categoryId: v })}
                    options={categoryOptions}
                    required
                  />
                  <Field
                    label="Brand"
                    value={form.brandId}
                    onChange={(v) => setForm({ ...form, brandId: v })}
                    options={brandOptions}
                  />
                  <Field
                    label="Product type"
                    value={form.productType}
                    onChange={(v) => setForm({ ...form, productType: v })}
                    options={[
                      { value: "STOCK", label: "Stock" },
                      { value: "SERVICE", label: "Service" },
                      { value: "RAW_MATERIAL", label: "Raw material" },
                      { value: "FINISHED_GOOD", label: "Finished good" },
                      { value: "BUNDLE", label: "Bundle" },
                    ]}
                    required
                  />
                  <Field
                    label="Base unit"
                    value={form.baseUnitId}
                    onChange={(v) => setForm({ ...form, baseUnitId: v })}
                    options={unitOptions}
                    required
                  />
                  <Field
                    label="Description"
                    value={form.description}
                    onChange={(v) => setForm({ ...form, description: v })}
                    full
                  />
                  <div className="check-grid">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={form.isSellable}
                        onChange={(e) =>
                          setForm({ ...form, isSellable: e.target.checked })
                        }
                      />{" "}
                      Sellable
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={form.isPurchasable}
                        onChange={(e) =>
                          setForm({ ...form, isPurchasable: e.target.checked })
                        }
                      />{" "}
                      Purchasable
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={form.isStockItem}
                        onChange={(e) =>
                          setForm({ ...form, isStockItem: e.target.checked })
                        }
                      />{" "}
                      Stock item
                    </label>
                  </div>
                </div>
              </Section>
              <Section
                title="Inventory controls"
                description="Optional tracking flags for future inventory operations."
              >
                <div className="check-grid">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.trackBatch}
                      onChange={(e) =>
                        setForm({ ...form, trackBatch: e.target.checked })
                      }
                    />{" "}
                    Track batch
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.trackExpiry}
                      onChange={(e) =>
                        setForm({ ...form, trackExpiry: e.target.checked })
                      }
                    />{" "}
                    Track expiry
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.trackSerial}
                      onChange={(e) =>
                        setForm({ ...form, trackSerial: e.target.checked })
                      }
                    />{" "}
                    Track serial
                  </label>
                </div>
              </Section>
            </>
          )}

          {step === 1 && (
            <Section
              title="Identifiers"
              description="Supports UPC, EAN, supplier item numbers and other identifiers."
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addIdentifier}
              >
                ＋ Add identifier
              </button>
              <div className="mini-table" style={{ marginTop: 12 }}>
                <div
                  className="mini-head"
                  style={{ gridTemplateColumns: "1fr 1.5fr .7fr 35px" }}
                >
                  <span>Type</span>
                  <span>Identifier</span>
                  <span>Primary</span>
                  <span />
                </div>
                {identifiers.map((x, i) => (
                  <div
                    className="mini-row"
                    key={i}
                    style={{ gridTemplateColumns: "1fr 1.5fr .7fr 35px" }}
                  >
                    <select
                      className="control"
                      value={x.identifierTypeId}
                      onChange={(e) => {
                        const a = [...identifiers];
                        a[i] = { ...x, identifierTypeId: e.target.value };
                        setIdentifiers(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {identifierTypeOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="control"
                      value={x.identifierValue}
                      placeholder="049000028904"
                      onChange={(e) => {
                        const a = [...identifiers];
                        a[i] = { ...x, identifierValue: e.target.value };
                        setIdentifiers(a);
                      }}
                    />
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={x.isPrimary}
                        onChange={(e) =>
                          setIdentifiers(
                            identifiers.map((v, j) => ({
                              ...v,
                              isPrimary: j === i ? e.target.checked : false,
                            })),
                          )
                        }
                      />{" "}
                      Primary
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setIdentifiers(identifiers.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {identifiers.length === 0 && (
                <div className="empty">
                  No identifiers added. You can add them now or later.
                </div>
              )}
            </Section>
          )}

          {step === 2 && (
            <Section
              title="Packaging / units"
              description="Define purchase and sales units and conversion to the base unit."
            >
              <div className="mini-table">
                <div className="mini-head units">
                  <span>Unit</span>
                  <span>Conversion to base</span>
                  <span>Purchase</span>
                  <span>Sales</span>
                  <span />
                </div>
                {productUnits.map((x, i) => (
                  <div className="mini-row units" key={i}>
                    <select
                      className="control"
                      value={x.unitId}
                      onChange={(e) => {
                        const a = [...productUnits];
                        a[i] = { ...x, unitId: e.target.value };
                        setProductUnits(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {unitOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="control"
                      type="number"
                      min="0"
                      step="0.000001"
                      value={x.conversionFactor}
                      onChange={(e) => {
                        const a = [...productUnits];
                        a[i] = { ...x, conversionFactor: e.target.value };
                        setProductUnits(a);
                      }}
                    />
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={x.isPurchaseUnit}
                        onChange={(e) => {
                          const a = [...productUnits];
                          a[i] = { ...x, isPurchaseUnit: e.target.checked };
                          setProductUnits(a);
                        }}
                      />{" "}
                      ✓
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={x.isSalesUnit}
                        onChange={(e) => {
                          const a = [...productUnits];
                          a[i] = { ...x, isSalesUnit: e.target.checked };
                          setProductUnits(a);
                        }}
                      />{" "}
                      ✓
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setProductUnits(productUnits.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addUnit}
              >
                ＋ Add unit
              </button>
            </Section>
          )}

          {step === 3 && (
            <Section
              title="Pricing"
              description="Attach selling and supplier purchase prices to product units."
            >
              <div className="mini-table">
                <div className="mini-head pricing">
                  <span>Price list</span>
                  <span>Unit</span>
                  <span>Selling price</span>
                  <span>Minimum qty</span>
                  <span />
                </div>
                {prices.map((x, i) => (
                  <div className="mini-row pricing" key={i}>
                    <select
                      className="control"
                      value={x.priceListId}
                      onChange={(e) => {
                        const a = [...prices];
                        a[i] = { ...x, priceListId: e.target.value };
                        setPrices(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {priceListOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="control"
                      value={x.unitId}
                      onChange={(e) => {
                        const a = [...prices];
                        a[i] = { ...x, unitId: e.target.value };
                        setPrices(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {unitOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="control"
                      type="number"
                      step="0.01"
                      value={x.sellingPrice}
                      placeholder="250.00"
                      onChange={(e) => {
                        const a = [...prices];
                        a[i] = { ...x, sellingPrice: e.target.value };
                        setPrices(a);
                      }}
                    />
                    <input
                      className="control"
                      type="number"
                      min="1"
                      value={x.minimumQuantity}
                      onChange={(e) => {
                        const a = [...prices];
                        a[i] = { ...x, minimumQuantity: e.target.value };
                        setPrices(a);
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setPrices(prices.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addPrice}
              >
                ＋ Add price
              </button>
              <div style={{ marginTop: 24 }}>
                <h3>Supplier purchase prices</h3>
                <p className="section-desc">
                  Record what each supplier charges for a product unit.
                </p>
              </div>
              <div className="mini-table">
                <div className="mini-head pricing">
                  <span>Supplier</span>
                  <span>Purchase unit</span>
                  <span>Purchase price</span>
                  <span>Minimum qty</span>
                  <span />
                </div>
                {supplierPrices.map((x, i) => (
                  <div className="mini-row pricing" key={i}>
                    <select
                      className="control"
                      value={x.supplierId}
                      onChange={(e) => {
                        const a = [...supplierPrices];
                        a[i] = { ...x, supplierId: e.target.value };
                        setSupplierPrices(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {supplierOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="control"
                      value={x.unitId}
                      onChange={(e) => {
                        const a = [...supplierPrices];
                        a[i] = { ...x, unitId: e.target.value };
                        setSupplierPrices(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {unitOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="control"
                      type="number"
                      min="0"
                      step="0.01"
                      value={x.purchasePrice}
                      placeholder="200.00"
                      onChange={(e) => {
                        const a = [...supplierPrices];
                        a[i] = { ...x, purchasePrice: e.target.value };
                        setSupplierPrices(a);
                      }}
                    />
                    <input
                      className="control"
                      type="number"
                      min="1"
                      value={x.minimumQuantity}
                      onChange={(e) => {
                        const a = [...supplierPrices];
                        a[i] = { ...x, minimumQuantity: e.target.value };
                        setSupplierPrices(a);
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setSupplierPrices(
                          supplierPrices.filter((_, j) => j !== i),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addSupplierPrice}
              >
                ＋ Add supplier price
              </button>
            </Section>
          )}

          {step === 4 && (
            <Section
              title="Locations"
              description="Control where the product can be sold or purchased."
            >
              <div className="mini-table">
                <div className="mini-head locations">
                  <span>Location</span>
                  <span>Active</span>
                  <span>Sellable</span>
                  <span>Purchasable</span>
                  <span />
                </div>
                {locations.map((x, i) => (
                  <div className="mini-row locations" key={i}>
                    <select
                      className="control"
                      value={x.locationId}
                      onChange={(e) => {
                        const a = [...locations];
                        a[i] = { ...x, locationId: e.target.value };
                        setLocations(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {locationOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span className="status status-on">
                      <i />
                      Active
                    </span>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={x.isSellable}
                        onChange={(e) => {
                          const a = [...locations];
                          a[i] = { ...x, isSellable: e.target.checked };
                          setLocations(a);
                        }}
                      />{" "}
                      ✓
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={x.isPurchasable}
                        onChange={(e) => {
                          const a = [...locations];
                          a[i] = { ...x, isPurchasable: e.target.checked };
                          setLocations(a);
                        }}
                      />{" "}
                      ✓
                    </label>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() =>
                        setLocations(locations.filter((_, j) => j !== i))
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addLocation}
              >
                ＋ Add location
              </button>
            </Section>
          )}
          {step === 5 && (
            <Section
              title="Attributes"
              description="Optional product characteristics."
            >
              {productAttributes.map((x, i) => (
                <div
                  className="mini-row"
                  style={{ gridTemplateColumns: "1fr 2fr 35px" }}
                  key={i}
                >
                  <select
                    className="control"
                    value={x.attributeId}
                    onChange={(e) => {
                      const rows = [...productAttributes];
                      rows[i] = { ...x, attributeId: e.target.value };
                      setProductAttributes(rows);
                    }}
                  >
                    <option value="">Select...</option>
                    {attributeOptions.map((o) => (
                      <option key={String(o.value)} value={String(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="control"
                    value={x.value}
                    onChange={(e) => {
                      const rows = [...productAttributes];
                      rows[i] = { ...x, value: e.target.value };
                      setProductAttributes(rows);
                    }}
                    placeholder="Value"
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() =>
                      setProductAttributes(
                        productAttributes.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addAttribute}
              >
                ＋ Add attribute
              </button>
            </Section>
          )}
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-foot wizard-foot">
          <div className="step-note">
            <strong>Product setup:</strong> {validGeneral ? "✓" : "✕"} General ·{" "}
            {validUnits ? "✓" : "✕"} Unit · ○ Identifier (Optional) ·{" "}
            {validPrices ? "✓" : "✕"} Selling price ·{" "}
            {validSupplierPrices ? "✓" : "✕"} Purchase price / supplier ·{" "}
            {validLocations ? "✓" : "✕"} Location
          </div>
          <div className="step-note">
            Step {step + 1} of {steps.length} · {steps[step]}
          </div>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => (step === 0 ? setOpen(false) : setStep(step - 1))}
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep(step + 1)}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !setupValid}
                onClick={submit}
              >
                {busy
                  ? mode === "update"
                    ? "Updating..."
                    : "Creating..."
                  : mode === "update"
                    ? "Update Product"
                    : "Create Product"}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
