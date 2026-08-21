import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { productsApi, type SupplierPriceHistoryPage, type SupplierPriceSummary } from "../api/productsApi";
import { categoriesApi } from "../../categories/api/categoriesApi";
import { brandsApi } from "../../brands/api/brandsApi";
import { unitsApi } from "../../units/api/unitsApi";
import { identifierTypesApi } from "../../identifier-types/api/identifier-typesApi";
import { priceListsApi } from "../../price-lists/api/price-listsApi";
import { locationsApi } from "../../locations/api/locationsApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { Modal } from "../../../components/ui/Modal";
import { Field } from "../../../components/ui/Field";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { Section } from "../../../components/ui/Section";
import { attributesApi } from "../../attributes/api/attributesApi";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../../services/apiClient";
import { ProductSellingPricesUpdate } from "../components/ProductSellingPricesUpdate";
import { ProductSupplierPricesUpdate } from "../components/ProductSupplierPricesUpdate";

type ProductForm = {
  sku: string;
  productName: string;
  description: string;
  productType: string;
  categoryId: string;
  brandId: string;
  baseUnitId: string;
  isActive: boolean;
  isSellable: boolean;
  isPurchasable: boolean;
  isStockItem: boolean;
  trackBatch: boolean;
  trackExpiry: boolean;
  trackSerial: boolean;
};
type Identifier = {
  productIdentifierId?: number;
  identifierTypeId: string;
  productUnitId?: string;
  identifierValue: string;
  isPrimary: boolean;
  isActive?: boolean;
};
type PUnit = {
  productUnitId?: number;
  unitId: string;
  conversionFactor: string;
  isBaseUnit: boolean;
  isPurchaseUnit: boolean;
  isSalesUnit: boolean;
  isActive: boolean;
  hasReferences?: boolean;
  referenceReason?: string | null;
  baseUnitLocked?: boolean;
};
type Price = {
  priceListItemId?: number;
  priceListId: string;
  unitId: string;
  sellingPrice: string;
  currencyCode: string;
  minimumQuantity: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
  effectiveStatus?: string;
  pendingRemoval?: boolean;
};
type Location = {
  productLocationId?: number;
  locationId: string;
  isSellable: boolean;
  isPurchasable: boolean;
};
type SupplierPrice = {
  productSupplierId?: number;
  productSupplierPriceId?: number;
  supplierId: string;
  unitId: string;
  supplierProductCode: string;
  minimumOrderQty: string;
  leadTimeDays: string;
  isPrimarySupplier: boolean;
  supplierIsActive?: boolean;
  supplierUnitIsActive?: boolean;
  isDefaultPurchaseUnit?: boolean;
  purchasePrice: string;
  currencyCode: string;
  minimumQuantity: string;
  effectiveFrom: string;
  effectiveTo?: string;
  isActive?: boolean;
  effectiveStatus?: string;
  pendingRemoval?: boolean;
};
type SupplierDraft = { originalSupplierId?: string; supplierId: string; isPrimarySupplier: boolean };
type SupplierUnitDraft = { originalUnitId?: string; supplierId: string; unitId: string; supplierProductCode: string; minimumOrderQty: string; leadTimeDays: string; isDefaultPurchaseUnit: boolean };
type InitialPriceDraft = { supplierId: string; unitId: string; purchasePrice: string; currencyCode: string };
type ProductAttribute = { productAttributeId?: number; attributeId: string; value: string };
type ProductImage = {
  productImageId?: number;
  imageUrl: string;
  fileName?: string;
  altText?: string;
  displayOrder: number;
  isPrimary: boolean;
  pendingRemoval?: boolean;
};
const productUnitSignature = (rows: PUnit[]) => JSON.stringify(rows.map((row) => ({ id: row.productUnitId ?? null, unitId: row.unitId, conversionFactor: Number(row.conversionFactor), base: row.isBaseUnit, purchase: row.isPurchaseUnit, sales: row.isSalesUnit, active: row.isActive })).sort((a, b) => (a.id ?? 999999) - (b.id ?? 999999)));
const generalSignature = (value: ProductForm) => JSON.stringify({ ...value, sku: undefined, baseUnitId: undefined });
const identifierSignature = (rows: Identifier[]) => JSON.stringify(rows.map((row) => ({ ...row, identifierValue: row.identifierValue.trim() })));
const locationSignature = (rows: Location[]) => JSON.stringify(rows);
const attributeSignature = (rows: ProductAttribute[]) => JSON.stringify(rows);
const supplierLinkSignature = (rows: SupplierPrice[]) => JSON.stringify(rows.filter((row) => !row.pendingRemoval).map((row) => ({ id: row.productSupplierId, supplierId: row.supplierId, unitId: row.unitId, code: row.supplierProductCode, lead: row.leadTimeDays, primary: row.isPrimarySupplier })).filter((row, index, all) => all.findIndex((candidate) => candidate.id ? candidate.id === row.id : candidate.supplierId === row.supplierId) === index));
const supplierPriceSignature = (rows: SupplierPrice[]) => JSON.stringify(rows.map((row) => ({ id: row.productSupplierPriceId, supplierId: row.supplierId, unitId: row.unitId, price: row.purchasePrice, from: row.effectiveFrom, to: row.effectiveTo, active: row.isActive, removed: row.pendingRemoval })));
const posIdentifierCodes = new Set(["BARCODE", "EAN", "UPC", "GTIN", "PLU"]);

function ProductImageVisual({ src, alt, className }: { src?: string; alt?: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className={`${className} product-image-placeholder`}>No image</div>;
  return <img className={className} src={src} alt={alt || "Product image"} onError={() => setFailed(true)} />;
}

const primaryProductImage = (product: any) =>
  (product?.productImages ?? []).find((image: any) => image.isActive !== false && image.isPrimary) ??
  (product?.productImages ?? []).find((image: any) => image.isActive !== false);

const localDateValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const displayDate = (value?: string | null) => {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
};
const displayMoney = (currency: string, value: string | number) =>
  `${currency || "LKR"} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const displayDateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";
const visiblePriceStatus = (row: { isActive?: boolean; effectiveStatus?: string; effectiveFrom: string; effectiveTo?: string }) => {
  if (row.isActive === false) return "Ended";
  if (row.effectiveStatus === "CURRENT") return "Current";
  if (row.effectiveStatus === "FUTURE") return "Future";
  if (row.effectiveStatus === "EXPIRED" || row.effectiveStatus === "INACTIVE") return "Ended";
  const today = localDateValue();
  if (row.effectiveFrom > today) return "Future";
  if (row.effectiveTo && row.effectiveTo < today) return "Ended";
  return "Current";
};

const id = (r: any, key: string) => r?.[key] ?? r?.id;
const emptyProduct = (): ProductForm => ({
  sku: "",
  productName: "",
  description: "",
  productType: "STOCK",
  categoryId: "",
  brandId: "",
  baseUnitId: "",
  isActive: true,
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
  const [identifierErrors, setIdentifierErrors] = useState<Record<number, string>>({});
  const [productUnits, setProductUnits] = useState<PUnit[]>([]);
  const [unitError, setUnitError] = useState("");
  const [savedProductUnitSignature, setSavedProductUnitSignature] = useState("");
  const [savedSectionSignatures, setSavedSectionSignatures] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<Price[]>([]);
  const [supplierPrices, setSupplierPrices] = useState<SupplierPrice[]>([]);
  const [removedSellingPriceIds, setRemovedSellingPriceIds] = useState<number[]>([]);
  const [removedSupplierPriceIds, setRemovedSupplierPriceIds] = useState<number[]>([]);
  const [pricingError, setPricingError] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [productAttributes, setProductAttributes] = useState<
    ProductAttribute[]
  >([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [imageError, setImageError] = useState("");
  const [mode, setMode] = useState<"create" | "update">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [updatePickerOpen, setUpdatePickerOpen] = useState(false);
  const [updateSearch, setUpdateSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const createSubmitLock = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const [viewing, setViewing] = useState<any>(null);
  const [viewSupplierSummary, setViewSupplierSummary] = useState<SupplierPriceSummary[]>([]);
  const [viewSupplierSummaryLoading, setViewSupplierSummaryLoading] = useState(false);
  const [viewSupplierSummaryError, setViewSupplierSummaryError] = useState("");
  const [viewSupplierHistoryOpen, setViewSupplierHistoryOpen] = useState(false);
  const [viewSupplierHistory, setViewSupplierHistory] = useState<SupplierPriceHistoryPage | null>(null);
  const [viewSupplierHistoryLoading, setViewSupplierHistoryLoading] = useState(false);
  const [viewSupplierHistoryError, setViewSupplierHistoryError] = useState("");
  const [confirming, setConfirming] = useState<any>(null);
  const [expandedSellingHistory, setExpandedSellingHistory] = useState(false);
  const [expandedSupplierHistory, setExpandedSupplierHistory] = useState<string[]>([]);
  const [editingSupplierKeys, setEditingSupplierKeys] = useState<string[]>([]);
  const [selectedCreateSupplierId, setSelectedCreateSupplierId] = useState("");
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft | null>(null);
  const [supplierUnitDraft, setSupplierUnitDraft] = useState<SupplierUnitDraft | null>(null);
  const [initialPriceDraft, setInitialPriceDraft] = useState<InitialPriceDraft | null>(null);

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
      code: r.categoryCode ?? r.code,
    }));
  const brandOptions = (brands.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "brandId"),
      label: r.brandName ?? r.name,
      code: r.brandCode ?? r.code,
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
      code: String(r.code ?? "").toUpperCase(),
    }));
  const priceListOptions = (priceLists.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "priceListId"),
      label: r.name ?? r.code,
      currencyCode: r.currencyCode,
    }));
  const locationOptions = (locationsQ.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, "locationId"), label: r.name ?? r.code }));
  const supplierOptions = (suppliers.data ?? [])
    .filter((r: any) => r.isActive !== false)
    .map((r: any) => ({
      value: id(r, "supplierId"),
      label: `${r.supplierName ?? r.name} (${r.supplierCode ?? r.code ?? ""})`,
      name: r.supplierName ?? r.name,
      code: r.supplierCode ?? r.code,
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
    setIdentifierErrors({});
    setProductUnits([]);
    setUnitError("");
    setSavedProductUnitSignature("");
    setSavedSectionSignatures({});
    setPrices([{
      priceListId: "",
      unitId: "",
      sellingPrice: "",
      currencyCode: "LKR",
      minimumQuantity: "1",
      effectiveFrom: new Date().toISOString().slice(0, 10),
    }]);
    setSupplierPrices([]);
    setRemovedSellingPriceIds([]);
    setRemovedSupplierPriceIds([]);
    setPricingError("");
    setLocations([]);
    setProductAttributes([]);
    setImages([]);
    setImageUrlDraft("");
    setImageError("");
    setStep(0);
    setError("");
    setExpandedSellingHistory(false);
    setExpandedSupplierHistory([]);
    setEditingSupplierKeys([]);
    setSelectedCreateSupplierId("");
    setSupplierDraft(null);
    setSupplierUnitDraft(null);
    setInitialPriceDraft(null);
    setOpen(true);
  };

  const closeWizard = () => {
    setOpen(false);
    setMode("create");
    setEditingId(null);
    setForm(emptyProduct());
    setIdentifiers([]);
    setIdentifierErrors({});
    setProductUnits([]);
    setUnitError("");
    setSavedProductUnitSignature("");
    setSavedSectionSignatures({});
    setPrices([]);
    setSupplierPrices([]);
    setRemovedSellingPriceIds([]);
    setRemovedSupplierPriceIds([]);
    setLocations([]);
    setProductAttributes([]);
    setImages([]);
    setImageUrlDraft("");
    setImageError("");
    setStep(0);
    setError("");
    setPricingError("");
    setBusy(false);
    setExpandedSellingHistory(false);
    setExpandedSupplierHistory([]);
    setEditingSupplierKeys([]);
    setSelectedCreateSupplierId("");
    setSupplierDraft(null);
    setSupplierUnitDraft(null);
    setInitialPriceDraft(null);
  };

  const addIdentifier = () =>
    (setIdentifierErrors({}), setIdentifiers([
      ...identifiers,
      {
        identifierTypeId: "",
        productUnitId: mode === "update" ? String(productUnits.find((unit) => unit.isBaseUnit && unit.isActive)?.productUnitId ?? "") : undefined,
        identifierValue: "",
        isPrimary: identifiers.length === 0,
      },
    ]));
  const addUnit = () =>
    setProductUnits([
      ...productUnits,
      {
        unitId: "",
        conversionFactor: "1",
        isBaseUnit: false,
        isPurchaseUnit: false,
        isSalesUnit: false,
        isActive: true,
      },
    ]);
  const selectBaseUnit = (unitId: string) => {
    const currentBase = productUnits.find((row) => row.isBaseUnit);
    if (mode === "update" && currentBase?.baseUnitLocked && unitId !== currentBase.unitId) {
      setError("The base unit cannot be changed after transactions or stock records exist.");
      return;
    }
    setUnitError("");
    setForm((current) => ({ ...current, baseUnitId: unitId }));
    if (mode === "create")
      setPrices((rows) => rows.map((row) => ({ ...row, unitId })));
    setProductUnits((rows) => {
      const existingIndex = rows.findIndex((row) => row.unitId === unitId);
      if (!unitId) return rows.map((row) => ({ ...row, isBaseUnit: false, isSalesUnit: false }));
      if (existingIndex >= 0)
        return rows.map((row, index) => ({
          ...row,
          isBaseUnit: index === existingIndex,
          isSalesUnit: index === existingIndex,
          conversionFactor: index === existingIndex ? "1" : row.conversionFactor,
        }));
      return [...rows.map((row) => ({ ...row, isBaseUnit: false, isSalesUnit: false })), {
        unitId,
        conversionFactor: "1",
        isBaseUnit: true,
        isPurchaseUnit: false,
        isSalesUnit: true,
        isActive: true,
      }];
    });
  };
  const removeProductUnit = (row: PUnit, index: number) => {
    setUnitError("");
    if (row.isBaseUnit) return;
    if (!row.productUnitId) {
      setProductUnits((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
      return;
    }
    if (row.hasReferences) {
      setUnitError("This unit cannot be removed because it is used by existing records. You can deactivate it instead.");
      return;
    }
    setProductUnits((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  };
  const setProductUnitActive = (index: number, isActive: boolean) => {
    setUnitError("");
    setProductUnits((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, isActive } : row));
  };
  const addPrice = () =>
    (clearPricingErrors(), setPrices([
      ...prices,
      {
        priceListId: "",
        unitId: form.baseUnitId,
        sellingPrice: "",
        currencyCode: "LKR",
        minimumQuantity: "1",
        effectiveFrom: new Date().toISOString().slice(0, 10),
      },
    ]));
  const addSupplierPrice = () =>
    (clearPricingErrors(), setSupplierPrices([
      ...supplierPrices,
      {
        supplierId: "",
        unitId: "",
        supplierProductCode: "",
        minimumOrderQty: "",
        leadTimeDays: "",
        isPrimarySupplier: false,
        purchasePrice: "",
        currencyCode: "LKR",
        minimumQuantity: "1",
        effectiveFrom: new Date().toISOString().slice(0, 10),
      },
    ]));
  const clearPricingErrors = () => {
    setPricingError("");
    setError("");
  };
  const updateSellingPrice = (index: number, change: Partial<Price>) => {
    setPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row));
    clearPricingErrors();
  };
  const updateSupplierPrice = (index: number, change: Partial<SupplierPrice>) => {
    setSupplierPrices((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row));
    clearPricingErrors();
  };
  const updateSupplierLink = (index: number, change: Partial<SupplierPrice>) => {
    setSupplierPrices((rows) => {
      const selected = rows[index];
      return rows.map((row, rowIndex) => {
        const sameLink = selected.productSupplierId
          ? row.productSupplierId === selected.productSupplierId
          : Boolean(selected.supplierId) && row.supplierId === selected.supplierId;
        return rowIndex === index || sameLink ? { ...row, ...change } : row;
      });
    });
    clearPricingErrors();
  };
  const selectPrimarySupplier = (index: number, checked: boolean) => {
    setSupplierPrices((rows) => {
      const selected = rows[index];
      return rows.map((row) => ({
        ...row,
        isPrimarySupplier: checked && (
          selected.productSupplierId
            ? row.productSupplierId === selected.productSupplierId
            : Boolean(selected.supplierId) && row.supplierId === selected.supplierId
        ),
      }));
    });
    clearPricingErrors();
  };

  const emptyCreateSupplierRow = (supplierId: string, isPrimarySupplier: boolean): SupplierPrice => ({
    supplierId,
    unitId: "",
    supplierProductCode: "",
    minimumOrderQty: "1",
    leadTimeDays: "",
    isPrimarySupplier,
    supplierIsActive: true,
    supplierUnitIsActive: true,
    isDefaultPurchaseUnit: false,
    purchasePrice: "",
    currencyCode: "LKR",
    minimumQuantity: "1",
    effectiveFrom: localDateValue(),
    isActive: true,
  });

  const saveCreateSupplier = () => {
    if (!supplierDraft?.supplierId) return;
    const duplicate = supplierPrices.some((row) =>
      row.supplierId === supplierDraft.supplierId && row.supplierId !== supplierDraft.originalSupplierId,
    );
    if (duplicate) {
      setPricingError("That supplier is already approved for this product.");
      return;
    }
    setSupplierPrices((rows) => {
      let next = rows.map((row) => ({
        ...row,
        isPrimarySupplier: supplierDraft.isPrimarySupplier ? false : row.isPrimarySupplier,
      }));
      if (supplierDraft.originalSupplierId) {
        next = next.map((row) => row.supplierId === supplierDraft.originalSupplierId ? {
          ...row,
          supplierId: supplierDraft.supplierId,
          isPrimarySupplier: supplierDraft.isPrimarySupplier,
          supplierIsActive: true,
        } : row);
      } else {
        next = [...next, emptyCreateSupplierRow(supplierDraft.supplierId, supplierDraft.isPrimarySupplier)];
      }
      return next;
    });
    setSelectedCreateSupplierId(supplierDraft.supplierId);
    setSupplierDraft(null);
    clearPricingErrors();
  };

  const deactivateCreateSupplier = (supplierId: string) => {
    setSupplierPrices((rows) => rows.map((row) => row.supplierId === supplierId ? {
      ...row,
      supplierIsActive: false,
      supplierUnitIsActive: false,
      isPrimarySupplier: false,
      isActive: false,
    } : row));
    clearPricingErrors();
  };

  const saveCreateSupplierUnit = () => {
    if (!supplierUnitDraft?.supplierId || !supplierUnitDraft.unitId) return;
    const { supplierId, originalUnitId, unitId } = supplierUnitDraft;
    const duplicate = supplierPrices.some((row) =>
      row.supplierId === supplierId && row.unitId === unitId && unitId !== originalUnitId,
    );
    if (duplicate) {
      setPricingError("That purchase unit is already configured for this supplier.");
      return;
    }
    setSupplierPrices((rows) => {
      const hasOtherActiveUnit = rows.some((row) => row.supplierId === supplierId && Boolean(row.unitId) && row.unitId !== originalUnitId && row.supplierUnitIsActive !== false);
      const makeDefault = supplierUnitDraft.isDefaultPurchaseUnit || !hasOtherActiveUnit;
      let next = makeDefault
        ? rows.map((row) => row.supplierId === supplierId ? { ...row, isDefaultPurchaseUnit: false } : row)
        : [...rows];
      const changes: Partial<SupplierPrice> = {
        unitId,
        supplierProductCode: supplierUnitDraft.supplierProductCode,
        minimumOrderQty: supplierUnitDraft.minimumOrderQty,
        leadTimeDays: supplierUnitDraft.leadTimeDays,
        isDefaultPurchaseUnit: makeDefault,
        supplierUnitIsActive: true,
      };
      if (originalUnitId) {
        return next.map((row) => row.supplierId === supplierId && row.unitId === originalUnitId ? { ...row, ...changes } : row);
      }
      const placeholderIndex = next.findIndex((row) => row.supplierId === supplierId && !row.unitId);
      if (placeholderIndex >= 0) return next.map((row, index) => index === placeholderIndex ? { ...row, ...changes } : row);
      const supplierRow = next.find((row) => row.supplierId === supplierId);
      return [...next, { ...emptyCreateSupplierRow(supplierId, Boolean(supplierRow?.isPrimarySupplier)), ...changes }];
    });
    setSupplierUnitDraft(null);
    clearPricingErrors();
  };

  const deactivateCreateSupplierUnit = (supplierId: string, unitId: string) => {
    setSupplierPrices((rows) => {
      let next = rows.map((row) => row.supplierId === supplierId && row.unitId === unitId ? {
        ...row,
        supplierUnitIsActive: false,
        isDefaultPurchaseUnit: false,
        isActive: false,
      } : row);
      if (!next.some((row) => row.supplierId === supplierId && row.supplierUnitIsActive !== false && row.isDefaultPurchaseUnit)) {
        const replacementUnitId = next.find((row) => row.supplierId === supplierId && row.unitId && row.supplierUnitIsActive !== false)?.unitId;
        if (replacementUnitId) next = next.map((row) => row.supplierId === supplierId && row.unitId === replacementUnitId ? { ...row, isDefaultPurchaseUnit: true } : row);
      }
      return next;
    });
    clearPricingErrors();
  };

  const saveCreateInitialPrice = () => {
    if (!initialPriceDraft?.supplierId || !initialPriceDraft.unitId || Number(initialPriceDraft.purchasePrice) <= 0) return;
    setSupplierPrices((rows) => {
      const existingIndex = rows.findIndex((row) =>
        row.supplierId === initialPriceDraft.supplierId && row.unitId === initialPriceDraft.unitId && Number(row.purchasePrice) > 0,
      );
      const blankIndex = rows.findIndex((row) =>
        row.supplierId === initialPriceDraft.supplierId && row.unitId === initialPriceDraft.unitId && !row.purchasePrice,
      );
      const priceChanges: Partial<SupplierPrice> = {
        purchasePrice: initialPriceDraft.purchasePrice,
        currencyCode: initialPriceDraft.currencyCode.trim().toUpperCase() || "LKR",
        effectiveFrom: localDateValue(),
        isActive: true,
      };
      if (existingIndex >= 0) return rows.map((row, index) => index === existingIndex ? { ...row, ...priceChanges } : row);
      if (blankIndex >= 0) return rows.map((row, index) => index === blankIndex ? { ...row, ...priceChanges } : row);
      const unitRow = rows.find((row) => row.supplierId === initialPriceDraft.supplierId && row.unitId === initialPriceDraft.unitId);
      return unitRow ? [...rows, { ...unitRow, productSupplierPriceId: undefined, ...priceChanges }] : rows;
    });
    setInitialPriceDraft(null);
    clearPricingErrors();
  };

  const removeSellingPrice = async (row: Price, index: number) => {
    if (form.isSellable && prices.filter((price) => !price.pendingRemoval).length <= 1) {
      setPricingError("At least one selling-price row is required.");
      return;
    }
    if (row.priceListItemId) {
      if (!editingId || !window.confirm("Delete this saved selling price? This will be applied when you update the product.")) return;
      setBusy(true);
      try {
        await productsApi.checkSellingPriceDeletion(editingId, row.priceListItemId);
        setRemovedSellingPriceIds((ids) => [...new Set([...ids, row.priceListItemId!])]);
        setPrices((rows) => rows.map((price, rowIndex) => rowIndex === index ? { ...price, pendingRemoval: true } : price));
      } catch (e) {
        setPricingError((e as Error).message);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (!row.priceListItemId) setPrices((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    clearPricingErrors();
  };

  const removeSupplierPrice = async (row: SupplierPrice, index: number) => {
    if (form.isPurchasable && supplierPrices.filter((price) => !price.pendingRemoval).length <= 1) {
      setPricingError("At least one supplier-purchase-price row is required.");
      return;
    }
    if (row.productSupplierPriceId) {
      if (!editingId || !window.confirm("Delete this saved supplier purchase price? This will be applied when you update the product.")) return;
      setBusy(true);
      try {
        await productsApi.checkSupplierPriceDeletion(editingId, row.productSupplierPriceId);
        setRemovedSupplierPriceIds((ids) => [...new Set([...ids, row.productSupplierPriceId!])]);
        setSupplierPrices((rows) => rows.map((price, rowIndex) => rowIndex === index ? { ...price, pendingRemoval: true } : price));
      } catch (e) {
        setPricingError((e as Error).message);
        return;
      } finally {
        setBusy(false);
      }
    }
    if (!row.productSupplierPriceId) setSupplierPrices((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
    clearPricingErrors();
  };

  const endSellingPrice = (row: Price, index: number) => {
    if (!window.confirm("End this selling price so it cannot be selected for future transactions?")) return;
    const now = new Date().toISOString().slice(0, 10);
    updateSellingPrice(index, { effectiveTo: row.effectiveFrom > now ? row.effectiveFrom : now });
  };

  const endSupplierPrice = (row: SupplierPrice, index: number) => {
    if (!window.confirm("End this supplier purchase price so it cannot be selected for future transactions?")) return;
    const now = new Date().toISOString().slice(0, 10);
    updateSupplierPrice(index, { effectiveTo: row.effectiveFrom > now ? row.effectiveFrom : now });
  };
  const changeSellingPrice = (row: Price, index: number) => {
    const today = localDateValue();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    updateSellingPrice(index, { effectiveTo: today });
    setPrices((rows) => [...rows, {
      priceListId: row.priceListId,
      unitId: row.unitId,
      sellingPrice: "",
      currencyCode: row.currencyCode || "LKR",
      minimumQuantity: "1",
      effectiveFrom: localDateValue(nextDate),
      isActive: true,
    }]);
  };
  const changeSupplierPurchasePrice = (row: SupplierPrice, index: number) => {
    const today = localDateValue();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    updateSupplierPrice(index, { effectiveTo: today });
    setSupplierPrices((rows) => [...rows, {
      productSupplierId: row.productSupplierId,
      supplierId: row.supplierId,
      unitId: row.unitId,
      supplierProductCode: row.supplierProductCode,
      minimumOrderQty: row.minimumOrderQty,
      leadTimeDays: row.leadTimeDays,
      isPrimarySupplier: row.isPrimarySupplier,
      purchasePrice: "",
      currencyCode: row.currencyCode || "LKR",
      minimumQuantity: "1",
      effectiveFrom: localDateValue(nextDate),
      isActive: true,
    }]);
  };
  const undoSellingPriceRemoval = (row: Price, index: number) => {
    setRemovedSellingPriceIds((ids) => ids.filter((priceId) => priceId !== row.priceListItemId));
    updateSellingPrice(index, { pendingRemoval: false });
  };
  const undoSupplierPriceRemoval = (row: SupplierPrice, index: number) => {
    setRemovedSupplierPriceIds((ids) => ids.filter((priceId) => priceId !== row.productSupplierPriceId));
    updateSupplierPrice(index, { pendingRemoval: false });
  };
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

  const addImage = async () => {
    const imageUrl = imageUrlDraft.trim();
    try {
      const parsed = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
      const fileName = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
      const activeImages = images.filter((image) => !image.pendingRemoval);
      if (mode === "update" && editingId) {
        setBusy(true);
        await productsApi.addImage(editingId, { imageUrl, fileName, altText: form.productName.trim() || undefined, displayOrder: activeImages.length, isPrimary: activeImages.length === 0 });
        setImageUrlDraft("");
        await refreshUpdateSection("Product image added.");
        return;
      }
      setImages([
        ...images,
        {
          imageUrl,
          fileName,
          altText: form.productName.trim() || undefined,
          displayOrder: activeImages.length,
          isPrimary: activeImages.length === 0,
        },
      ]);
      setImageUrlDraft("");
      setImageError("");
    } catch (reason) {
      setImageError(reason instanceof TypeError ? "Enter a valid HTTP or HTTPS image URL." : (reason as Error).message);
    } finally {
      if (mode === "update") setBusy(false);
    }
  };

  const selectPrimaryImage = async (index: number) => {
    const selected = images[index];
    if (mode === "update" && editingId && selected.productImageId) {
      setBusy(true);
      try { await productsApi.updateImage(editingId, selected.productImageId, { isPrimary: true }); await refreshUpdateSection("Primary product image updated."); }
      catch (reason) { setImageError((reason as Error).message); }
      finally { setBusy(false); }
      return;
    }
    setImages((rows) => rows.map((image, rowIndex) => ({
      ...image,
      isPrimary: !image.pendingRemoval && rowIndex === index,
    })));
    setImageError("");
  };

  const removeImage = async (index: number) => {
    const selectedImage = images[index];
    if (mode === "update" && editingId && selectedImage.productImageId) {
      if (!window.confirm("Remove this product image? Historical product data is unaffected.")) return;
      setBusy(true);
      try { await productsApi.deactivateImage(editingId, selectedImage.productImageId); await refreshUpdateSection("Product image removed."); }
      catch (reason) { setImageError((reason as Error).message); }
      finally { setBusy(false); }
      return;
    }
    setImages((rows) => {
      const selected = rows[index];
      let next = selected.productImageId
        ? rows.map((image, rowIndex) => rowIndex === index ? { ...image, pendingRemoval: true, isPrimary: false } : image)
        : rows.filter((_, rowIndex) => rowIndex !== index);
      const active = next.filter((image) => !image.pendingRemoval);
      if (active.length && !active.some((image) => image.isPrimary)) {
        const first = next.findIndex((image) => !image.pendingRemoval);
        next = next.map((image, rowIndex) => ({ ...image, isPrimary: rowIndex === first }));
      }
      return next;
    });
    setImageError("");
  };

  const undoImageRemoval = (index: number) => {
    setImages((rows) => rows.map((image, rowIndex) => rowIndex === index ? { ...image, pendingRemoval: false } : image));
    setImageError("");
  };
  const saveImageMetadata = async (index: number) => {
    const image = images[index];
    if (mode !== "update" || !editingId || !image.productImageId) return;
    setBusy(true); setImageError("");
    try {
      await productsApi.updateImage(editingId, image.productImageId, { imageUrl: image.imageUrl, fileName: image.fileName || null, altText: image.altText || null, displayOrder: image.displayOrder, isPrimary: image.isPrimary });
      await refreshUpdateSection("Product image details saved.");
    } catch (reason) { setImageError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const createSupplierMap = new Map<string, SupplierPrice[]>();
  supplierPrices.filter((row) => !row.pendingRemoval && row.supplierId).forEach((row) =>
    createSupplierMap.set(row.supplierId, [...(createSupplierMap.get(row.supplierId) ?? []), row]),
  );
  const createSuppliers = [...createSupplierMap.entries()].map(([supplierId, rows]) => ({
    supplierId,
    rows,
    isPrimarySupplier: rows.some((row) => row.isPrimarySupplier),
    isActive: rows.some((row) => row.supplierIsActive !== false),
  }));
  const createSupplierUnitMap = new Map<string, SupplierPrice[]>();
  supplierPrices.filter((row) => !row.pendingRemoval && row.supplierId && row.unitId).forEach((row) => {
    const key = `${row.supplierId}:${row.unitId}`;
    createSupplierUnitMap.set(key, [...(createSupplierUnitMap.get(key) ?? []), row]);
  });
  const createSupplierUnits = [...createSupplierUnitMap.values()].map((rows) => ({
    supplierId: rows[0].supplierId,
    unitId: rows[0].unitId,
    row: rows[0],
    isActive: rows.some((row) => row.supplierUnitIsActive !== false),
  }));
  const createInitialPrices = supplierPrices
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.pendingRemoval && row.supplierId && row.unitId && Number(row.purchasePrice) > 0);
  const activeCreateSupplierIds = new Set(createSuppliers.filter((supplier) => supplier.isActive).map((supplier) => supplier.supplierId));
  const activeCreateUnitKeys = new Set(createSupplierUnits.filter((unit) => unit.isActive && activeCreateSupplierIds.has(unit.supplierId)).map((unit) => `${unit.supplierId}:${unit.unitId}`));
  const effectiveCreateSupplierId = selectedCreateSupplierId && createSupplierMap.has(selectedCreateSupplierId)
    ? selectedCreateSupplierId
    : createSuppliers[0]?.supplierId ?? "";
  const supplierDisplay = (supplierId: string) => supplierOptions.find((option) => String(option.value) === supplierId);
  const unitDisplay = (unitId: string) => unitOptions.find((option) => String(option.value) === unitId)?.label ?? "—";

  const validGeneral = Boolean(
    form.productName.trim() && form.categoryId && form.baseUnitId,
  );
  const validUnits =
    productUnits.length > 0 &&
    new Set(productUnits.map((x) => x.unitId).filter(Boolean)).size === productUnits.filter((x) => x.unitId).length &&
    productUnits.every((x) => x.unitId && Number(x.conversionFactor) > 0) &&
    productUnits.filter((x) => x.isActive && x.isBaseUnit && x.unitId === form.baseUnitId && Number(x.conversionFactor) === 1).length === 1 &&
    productUnits.filter((x) => x.isActive && x.isSalesUnit).length === 1 &&
    productUnits.every((x) => x.isSalesUnit === x.isBaseUnit) &&
    (!form.isPurchasable || productUnits.some((x) => x.isActive && x.isPurchaseUnit));
  const validPrices = mode === "update" || (
    (!form.isSellable || prices.some((x) => !x.pendingRemoval && x.isActive !== false)) &&
    prices.filter((x) => !x.pendingRemoval).every(
      (x) => x.priceListId && x.unitId && Number(x.sellingPrice) > 0,
    ));
  const validSupplierPrices = mode === "update" || !form.isPurchasable || (
    activeCreateSupplierIds.size > 0 &&
    activeCreateUnitKeys.size > 0 &&
    createInitialPrices.some(({ row }) => row.isActive !== false && activeCreateUnitKeys.has(`${row.supplierId}:${row.unitId}`))
  );
  const selectedLocationIds = locations.map((location) => location.locationId).filter(Boolean);
  const validLocations =
    (!form.isStockItem || locations.length > 0) &&
    locations.every((x) => x.locationId) &&
    new Set(selectedLocationIds).size === selectedLocationIds.length;
  const validIdentifiers = identifiers.every(
    (x) => {
      const code = identifierTypeOptions.find((option) => String(option.value) === x.identifierTypeId)?.code ?? "";
      return x.identifierTypeId && x.identifierValue.trim() && (mode === "create" || !posIdentifierCodes.has(code) || x.productUnitId);
    },
  );
  const selectedAttributeIds = productAttributes.map((attribute) => attribute.attributeId).filter(Boolean);
  const validAttributes =
    productAttributes.every((x) => x.attributeId && x.value.trim()) &&
    new Set(selectedAttributeIds).size === selectedAttributeIds.length;
  const setupValid =
    validGeneral &&
    validUnits &&
    validPrices &&
    validSupplierPrices &&
    validLocations &&
    validIdentifiers &&
    validAttributes;

  const goToNextStep = () => {
    if (mode === "create" && step === 4 && !validSupplierPrices) {
      setPricingError("Purchasable products require at least one active supplier, one active supplier purchase unit, and one valid initial purchase price.");
      setError("");
      return;
    }
    setPricingError("");
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const selectForUpdate = async (productId: number) => {
    setBusy(true);
    setError("");
    setUnitError("");
    setPricingError("");
    setRemovedSellingPriceIds([]);
    setRemovedSupplierPriceIds([]);
    setIdentifierErrors({});
    try {
      const product: any = await productsApi.get(productId);
      setMode("update");
      setExpandedSellingHistory(false);
      setExpandedSupplierHistory([]);
      setEditingSupplierKeys([]);
      setEditingId(productId);
      const loadedForm: ProductForm = {
        sku: product.sku ?? "",
        productName: product.productName ?? "",
        description: product.description ?? "",
        productType: product.productType ?? "STOCK",
        categoryId: String(product.categoryId ?? ""),
        brandId: String(product.brandId ?? ""),
        baseUnitId: String(product.baseUnitId ?? ""),
        isActive: product.isActive !== false,
        isSellable: product.isSellable !== false,
        isPurchasable: product.isPurchasable !== false,
        isStockItem: product.isStockItem !== false,
        trackBatch: Boolean(product.trackBatch),
        trackExpiry: Boolean(product.trackExpiry),
        trackSerial: Boolean(product.trackSerial),
      };
      setForm(loadedForm);
      const loadedIdentifiers: Identifier[] = (product.identifiers ?? []).map((x: any) => ({
          productIdentifierId: Number(x.productIdentifierId),
          identifierTypeId: String(x.identifierTypeId),
          productUnitId: x.productUnitId ? String(x.productUnitId) : undefined,
          identifierValue: x.identifierValue,
          isActive: x.isActive !== false,
          isPrimary: Boolean(x.isPrimary),
        }));
      setIdentifiers(loadedIdentifiers);
      const loadedProductUnits: PUnit[] = (product.productUnits ?? []).map((x: any) => ({
          productUnitId: Number(x.productUnitId),
          unitId: String(x.unitId),
          conversionFactor: String(x.conversionFactor),
          isBaseUnit: Boolean(x.isBaseUnit),
          isPurchaseUnit: Boolean(x.isPurchaseUnit),
          isSalesUnit: Boolean(x.isBaseUnit),
          isActive: x.isActive !== false,
          hasReferences: Boolean(x.hasReferences),
          referenceReason: x.referenceReason ?? null,
          baseUnitLocked: Boolean(x.baseUnitLocked ?? product.baseUnitLocked),
        }));
      setProductUnits(loadedProductUnits);
      setSavedProductUnitSignature(productUnitSignature(loadedProductUnits));
      setPrices(
        (product.priceListItems ?? []).map((x: any) => ({
          priceListItemId: Number(x.priceListItemId),
          priceListId: String(x.priceListId),
          unitId: String(x.unitId),
          sellingPrice: String(x.sellingPrice),
          currencyCode: x.currencyCode ?? "LKR",
          minimumQuantity: String(x.minimumQuantity),
          effectiveFrom: String(x.effectiveFrom).slice(0, 10),
          effectiveTo: x.effectiveTo ? String(x.effectiveTo).slice(0, 10) : "",
          isActive: x.isActive !== false,
          effectiveStatus: x.effectiveStatus,
        })),
      );
      const loadedSupplierPrices: SupplierPrice[] = (product.productSuppliers ?? []).flatMap((link: any) =>
        (link.supplierUnits ?? []).flatMap((supplierUnit: any) =>
          (supplierUnit.prices ?? []).map((x: any) => ({
            productSupplierId: Number(link.productSupplierId),
            productSupplierPriceId: Number(x.productSupplierPriceId),
            supplierId: String(link.supplierId),
            supplierProductCode: supplierUnit.supplierProductCode ?? "",
            minimumOrderQty: supplierUnit.minimumOrderQty == null ? "" : String(supplierUnit.minimumOrderQty),
            leadTimeDays: supplierUnit.leadTimeDays == null ? "" : String(supplierUnit.leadTimeDays),
            isPrimarySupplier: Boolean(link.isPrimarySupplier),
            unitId: String(
              supplierUnit.productUnit?.unitId ?? "",
            ),
            purchasePrice: String(x.purchasePrice),
            currencyCode: x.currencyCode ?? "LKR",
            minimumQuantity: String(x.minimumQuantity),
            effectiveFrom: String(x.effectiveFrom).slice(0, 10),
            effectiveTo: x.effectiveTo ? String(x.effectiveTo).slice(0, 10) : "",
            isActive: x.isActive !== false,
            effectiveStatus: x.effectiveStatus,
          }))),
        );
      setSupplierPrices(loadedSupplierPrices);
      const loadedLocations: Location[] = (product.productLocations ?? []).map((x: any) => ({
          productLocationId: Number(x.productLocationId),
          locationId: String(x.locationId),
          isSellable: Boolean(x.isSellable),
          isPurchasable: Boolean(x.isPurchasable),
        }));
      setLocations(loadedLocations);
      const loadedAttributes: ProductAttribute[] = (product.productAttributes ?? []).map((x: any) => ({
          productAttributeId: Number(x.productAttributeId),
          attributeId: String(x.attributeId),
          value: x.value,
        }));
      setProductAttributes(loadedAttributes);
      setSavedSectionSignatures({ general: generalSignature(loadedForm), identifiers: identifierSignature(loadedIdentifiers), suppliers: supplierLinkSignature(loadedSupplierPrices), supplierPrices: supplierPriceSignature(loadedSupplierPrices), locations: locationSignature(loadedLocations), attributes: attributeSignature(loadedAttributes) });
      setImages(
        (product.productImages ?? []).map((image: any, index: number) => ({
          productImageId: Number(image.productImageId),
          imageUrl: image.imageUrl,
          fileName: image.fileName ?? undefined,
          altText: image.altText ?? undefined,
          displayOrder: Number(image.displayOrder ?? index),
          isPrimary: Boolean(image.isPrimary),
        })),
      );
      setImageUrlDraft("");
      setImageError("");
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
    setViewSupplierSummary([]);
    setViewSupplierSummaryError("");
    setViewSupplierSummaryLoading(true);
    setViewSupplierHistoryOpen(false);
    setViewSupplierHistory(null);
    setViewSupplierHistoryError("");
    try {
      const product = await productsApi.get(productId);
      setViewing(product);
      productsApi.supplierPriceSummary(productId)
        .then(setViewSupplierSummary)
        .catch((reason) => setViewSupplierSummaryError((reason as Error).message))
        .finally(() => setViewSupplierSummaryLoading(false));
    } catch (e) {
      setViewSupplierSummaryLoading(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const closeProductView = () => {
    setViewing(null);
    setViewSupplierSummary([]);
    setViewSupplierSummaryError("");
    setViewSupplierHistoryOpen(false);
    setViewSupplierHistory(null);
    setViewSupplierHistoryError("");
  };

  const loadViewSupplierHistory = async (page = 1) => {
    if (!viewing) return;
    setViewSupplierHistoryLoading(true);
    setViewSupplierHistoryError("");
    try {
      setViewSupplierHistory(await productsApi.supplierPriceHistory(Number(id(viewing, "productId")), { page, limit: 25 }));
    } catch (reason) {
      setViewSupplierHistoryError((reason as Error).message);
    } finally {
      setViewSupplierHistoryLoading(false);
    }
  };

  const openViewSupplierHistory = () => {
    setViewSupplierHistoryOpen(true);
    void loadViewSupplierHistory(1);
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
    if (createSubmitLock.current) return;
    const normalizedIdentifiers = identifiers.map((identifier) => identifier.identifierValue.trim().toUpperCase());
    const duplicateIdentifierIndexes = normalizedIdentifiers
      .map((value, index) => value && normalizedIdentifiers.indexOf(value) !== index ? index : -1)
      .filter((index) => index >= 0);
    if (duplicateIdentifierIndexes.length) {
      const duplicateValue = normalizedIdentifiers[duplicateIdentifierIndexes[0]];
      const rowErrors: Record<number, string> = {};
      normalizedIdentifiers.forEach((value, index) => {
        if (value === duplicateValue) rowErrors[index] = "Duplicate identifier in this product.";
      });
      setIdentifierErrors(rowErrors);
      setError("Duplicate product identifier.");
      setStep(2);
      return;
    }
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
    createSubmitLock.current = true;
    setBusy(true);
    setError("");
    setIdentifierErrors({});
    try {
      const { sku, ...productForm } = form;
      const payload = {
        ...productForm,
        categoryId: Number(form.categoryId),
        brandId: form.brandId ? Number(form.brandId) : undefined,
        baseUnitId: Number(form.baseUnitId),
        identifiers: identifiers.map((x) => ({
          ...x,
          identifierTypeId: Number(x.identifierTypeId),
          productUnitId: x.productUnitId ? Number(x.productUnitId) : undefined,
          identifierValue: x.identifierValue.trim().toUpperCase(),
        })),
        productUnits: productUnits.map((x) => ({
          ...x,
          unitId: Number(x.unitId),
          conversionFactor: Number(x.conversionFactor),
        })),
        ...(mode === "create" ? { prices: prices.filter((x) => !x.pendingRemoval).map((x) => ({
          priceListItemId: x.priceListItemId,
          priceListId: Number(x.priceListId),
          unitId: Number(x.unitId),
          sellingPrice: Number(x.sellingPrice),
          currencyCode: x.currencyCode,
          effectiveFrom: x.effectiveFrom,
          effectiveTo: x.effectiveTo || undefined,
          isActive: x.isActive,
        })) } : {}),
        ...(mode === "create" ? { supplierLinks: [...new Set(supplierPrices.filter((x) => !x.pendingRemoval && x.supplierIsActive !== false && x.supplierId).map((x) => x.supplierId))].map((supplierId) => {
          const supplierRows = supplierPrices.filter((x) => !x.pendingRemoval && x.supplierIsActive !== false && x.supplierId === supplierId);
          const unitIds = [...new Set(supplierRows.filter((x) => x.supplierUnitIsActive !== false && x.unitId).map((x) => x.unitId))];
          return {
            supplierId: Number(supplierId), isPrimarySupplier: supplierRows.some((x) => x.isPrimarySupplier), isActive: true,
            units: unitIds.map((unitId) => {
              const unitRows = supplierRows.filter((x) => x.unitId === unitId), first = unitRows[0];
              return { unitId: Number(unitId), supplierProductCode: first.supplierProductCode.trim() || null, minimumOrderQty: first.minimumOrderQty ? Number(first.minimumOrderQty) : null, leadTimeDays: first.leadTimeDays ? Number(first.leadTimeDays) : null, isDefaultPurchaseUnit: Boolean(first.isDefaultPurchaseUnit), isActive: true, prices: unitRows.filter((x) => Number(x.purchasePrice) > 0 && x.isActive !== false).map((x) => ({ purchasePrice: Number(x.purchasePrice), currencyCode: x.currencyCode, effectiveFrom: x.effectiveFrom, effectiveTo: x.effectiveTo || null, isActive: true })) };
            }),
          };
        }) } : {}),
        locations: locations.map((x) => ({
          ...x,
          locationId: Number(x.locationId),
        })),
        productAttributes: productAttributes.map((x) => ({
          ...x,
          attributeId: Number(x.attributeId),
        })),
        images: images.filter((image) => !image.pendingRemoval).map((image, index) => ({
          productImageId: image.productImageId,
          imageUrl: image.imageUrl,
          fileName: image.fileName || undefined,
          altText: image.altText || undefined,
          displayOrder: index,
          isPrimary: image.isPrimary,
        })),
        ...(mode === "update" ? {
          removedSupplierPriceIds,
        } : {}),
      };
      if (mode === "update" && editingId)
        await productsApi.update(editingId, payload);
      else await productsApi.create(payload);
      await qc.invalidateQueries({ queryKey: ["products"] });
      closeWizard();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        const duplicateValue = String((e.details as any)?.identifierValue ?? "").trim().toUpperCase();
        const duplicateIndex = identifiers.findIndex((identifier) => identifier.identifierValue.trim().toUpperCase() === duplicateValue);
        if (duplicateIndex >= 0) {
          setIdentifierErrors({ [duplicateIndex]: e.message });
          setStep(2);
        }
      }
    } finally {
      createSubmitLock.current = false;
      setBusy(false);
    }
  };

  const refreshUpdateSection = async (message: string) => {
    if (!editingId) return;
    const currentStep = step;
    await selectForUpdate(editingId);
    setStep(currentStep);
    setSuccess(message);
    await qc.invalidateQueries({ queryKey: ["products"] });
  };

  const saveUpdateSection = async (section: "general" | "units" | "identifiers" | "locations" | "attributes") => {
    if (!editingId || mode !== "update") return;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (section === "general") {
        await productsApi.updateGeneral(editingId, {
          productName: form.productName.trim(), description: form.description, productType: form.productType,
          categoryId: Number(form.categoryId), brandId: form.brandId ? Number(form.brandId) : null,
          isActive: form.isActive, isSellable: form.isSellable, isPurchasable: form.isPurchasable,
          isStockItem: form.isStockItem, trackBatch: form.trackBatch, trackExpiry: form.trackExpiry, trackSerial: form.trackSerial,
        });
        await refreshUpdateSection("General Information saved.");
      } else if (section === "units") {
        await productsApi.updateUnits(editingId, productUnits.map((unit) => ({ ...unit, unitId: Number(unit.unitId), conversionFactor: Number(unit.conversionFactor) })));
        await refreshUpdateSection("Product Units saved. Unit-dependent sections were refreshed.");
      } else if (section === "identifiers") {
        if (savedProductUnitSignature !== productUnitSignature(productUnits)) throw new Error("Save Product Unit changes before saving identifiers.");
        await productsApi.updateIdentifiers(editingId, identifiers.map((identifier) => ({ ...identifier, identifierTypeId: Number(identifier.identifierTypeId), productUnitId: identifier.productUnitId ? Number(identifier.productUnitId) : undefined, identifierValue: identifier.identifierValue.trim() })));
        await refreshUpdateSection("Identifiers saved.");
      } else if (section === "locations") {
        await productsApi.updateLocations(editingId, locations.map((location) => ({ ...location, locationId: Number(location.locationId) })));
        await refreshUpdateSection("Location changes saved.");
      } else if (section === "attributes") {
        await productsApi.updateAttributes(editingId, productAttributes.map((attribute) => ({ ...attribute, attributeId: Number(attribute.attributeId) })));
        await refreshUpdateSection("Attributes saved.");
      }
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const salesUnitOptions = productUnits
    .filter((unit) => unit.isActive && unit.isBaseUnit)
    .map((unit) => ({
      value: unit.unitId,
      label: unitOptions.find((option) => String(option.value) === unit.unitId)?.label ?? "Configured sales unit",
    }));
  const purchaseUnitOptions = productUnits
    .filter((unit) => unit.isPurchaseUnit)
    .map((unit) => ({
      value: unit.unitId,
      label: unitOptions.find((option) => String(option.value) === unit.unitId)?.label ?? "Configured purchase unit",
    }));
  const unitsDirty = savedProductUnitSignature !== productUnitSignature(productUnits);
  const generalDirty = savedSectionSignatures.general !== generalSignature(form);
  const identifiersDirty = savedSectionSignatures.identifiers !== identifierSignature(identifiers);
  const suppliersDirty = savedSectionSignatures.suppliers !== supplierLinkSignature(supplierPrices);
  const supplierPricesDirty = savedSectionSignatures.supplierPrices !== supplierPriceSignature(supplierPrices);
  const locationsDirty = savedSectionSignatures.locations !== locationSignature(locations);
  const attributesDirty = savedSectionSignatures.attributes !== attributeSignature(productAttributes);
  const sellingCurrentRows = prices
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.pendingRemoval && visiblePriceStatus(row) === "Current");
  const sellingHistoryRows = prices
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.pendingRemoval && visiblePriceStatus(row) !== "Current");
  const sellingDisplayRows = prices
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const rank = (row: Price) => visiblePriceStatus(row) === "Current" ? 0 : visiblePriceStatus(row) === "Future" ? 1 : 2;
      return rank(left.row) - rank(right.row);
    });
  const supplierGroupMap = new Map<string, Array<{ row: SupplierPrice; index: number }>>();
  supplierPrices.forEach((row, index) => {
    if (row.pendingRemoval) return;
    const key = row.productSupplierId ? `saved-${row.productSupplierId}` : row.supplierId ? `supplier-${row.supplierId}` : `new-${index}`;
    supplierGroupMap.set(key, [...(supplierGroupMap.get(key) ?? []), { row, index }]);
  });
  const supplierGroups = [...supplierGroupMap.entries()].map(([key, entries]) => ({ key, entries }));

  const steps = [
    "General",
    "Units",
    "Identifiers",
    "Selling Prices",
    "Suppliers & Purchase Prices",
    "Locations",
    "Attributes",
    "Images",
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
              placeholder="Search SKU, product name or identifier/barcode..."
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
              <th>Brand</th>
              <th>Base unit</th>
              <th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.isLoading ? (
              <tr>
                <td colSpan={7}>Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">No products found.</div>
                </td>
              </tr>
            ) : (
              rows.map((r: any) => (
                <tr key={id(r, "productId")}>
                  <td>
                    <div className="primary-cell">
                      <ProductImageVisual
                        src={primaryProductImage(r)?.imageUrl}
                        alt={primaryProductImage(r)?.altText || r.productName}
                        className="product-list-image"
                      />
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
                      "—"}
                  </td>
                  <td>{r.brand?.brandName ?? r.brand?.name ?? "—"}</td>
                  <td>
                    {r.baseUnit?.name ??
                      r.baseUnit?.code ??
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
        onClose={closeProductView}
        title="Product Details"
        subtitle={viewing ? `${viewing.sku} — ${viewing.productName}` : ""}
        wide
      >
        {viewing && (
          <div className="modal-body product-body">
            <Section title="Product Images" description="Primary image and product gallery.">
              {primaryProductImage(viewing) ? (
                <>
                  <ProductImageVisual
                    src={primaryProductImage(viewing)?.imageUrl}
                    alt={primaryProductImage(viewing)?.altText || viewing.productName}
                    className="product-view-primary-image"
                  />
                  <div className="product-view-gallery">
                    {(viewing.productImages ?? []).map((image: any) => (
                      <div key={image.productImageId} className={image.isPrimary ? "product-view-gallery-item primary" : "product-view-gallery-item"}>
                        <ProductImageVisual src={image.imageUrl} alt={image.altText || viewing.productName} className="product-view-gallery-image" />
                        {image.isPrimary && <small>Primary</small>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <ProductImageVisual className="product-view-primary-image" />
              )}
            </Section>
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
              <div className="product-view-description">{viewing.description || "No description provided."}</div>
              <div className="view-flag-row">
                <span className={viewing.isActive !== false ? "status status-on" : "status status-off"}><i /> {viewing.isActive !== false ? "Active" : "Inactive"}</span>
                {viewing.isSellable && <span className="view-flag">Sellable</span>}
                {viewing.isPurchasable && <span className="view-flag">Purchasable</span>}
                {viewing.isStockItem && <span className="view-flag">Stock item</span>}
                {viewing.trackBatch && <span className="view-flag">Batch tracked</span>}
                {viewing.trackExpiry && <span className="view-flag">Expiry tracked</span>}
                {viewing.trackSerial && <span className="view-flag">Serial tracked</span>}
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
                  <span>{x.isPrimary ? <span className="base-unit-badge">Primary</span> : "Active"}</span>
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
                    {x.isBaseUnit ? "Base " : ""}
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
              {(viewing.priceListItems ?? []).filter((x: any) => x.effectiveStatus === "CURRENT").map((x: any) => (
                <div className="view-price-row" key={x.priceListItemId}>
                  <span>{x.priceList?.name ?? x.priceList?.code}</span>
                  <span>{x.unit?.name ?? x.unit?.code}</span>
                  <strong>{displayMoney(x.currencyCode, x.sellingPrice)}</strong>
                  <span>From {displayDate(x.effectiveFrom)}</span>
                  <span className="status status-on">Current</span>
                </div>
              ))}
              {(viewing.priceListItems ?? []).filter((x: any) => x.effectiveStatus === "CURRENT").length === 0 && <div className="empty">No current selling prices.</div>}
              {(viewing.priceListItems ?? []).some((x: any) => x.effectiveStatus !== "CURRENT") && <details className="price-history-details"><summary>View Price History</summary>{(viewing.priceListItems ?? []).filter((x: any) => x.effectiveStatus !== "CURRENT").map((x: any) => <div className="view-price-row" key={x.priceListItemId}><span>{x.priceList?.name ?? x.priceList?.code}</span><span>{x.unit?.name ?? x.unit?.code}</span><strong>{displayMoney(x.currencyCode, x.sellingPrice)}</strong><span>{displayDate(x.effectiveFrom)} – {displayDate(x.effectiveTo)}</span><span className={x.effectiveStatus === "FUTURE" ? "status status-warn" : "status status-off"}>{x.effectiveStatus === "FUTURE" ? "Future" : "Ended"}</span></div>)}</details>}
            </Section>
            <Section
              title="Supplier / Purchase Prices"
              description="Supplier costing configuration."
            >
              <div className="product-view-supplier-heading">
                <h4>Approved Suppliers</h4>
                <button className="btn btn-secondary btn-sm" onClick={openViewSupplierHistory}>
                  View Purchase Price History
                </button>
              </div>
              {(viewing.productSuppliers ?? []).length > 0 && (
                <div className="supplier-price-table product-view-supplier-table">
                  <div className="supplier-price-row view-approved-supplier-columns supplier-price-table-head">
                    <div>Supplier Name</div><div>Supplier Code</div><div>Primary Supplier</div><div>Status</div>
                  </div>
                  {(viewing.productSuppliers ?? []).map((link: any) => (
                    <div className="supplier-price-row view-approved-supplier-columns" key={link.productSupplierId}>
                      <div>{link.supplier?.supplierName ?? link.supplier?.name ?? "—"}</div>
                      <div>{link.supplier?.supplierCode ?? "—"}</div>
                      <div>{link.isPrimarySupplier ? <span className="preferred-badge">Primary</span> : "—"}</div>
                      <div className={link.isActive !== false ? "supplier-price-status active" : "supplier-price-status inactive"}>
                        <span className="status-dot" /> {link.isActive !== false ? "Active" : "Inactive"}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(viewing.productSuppliers ?? []).length > 0 && (
                <>
                  <h4 className="product-view-supplier-subtitle">Supplier Purchase Units</h4>
                  <div className="supplier-price-table product-view-supplier-table">
                    <div className="supplier-price-row view-supplier-unit-columns supplier-price-table-head">
                      <div>Supplier</div><div>Purchase Unit</div><div>Supplier Item Code</div><div>MOQ</div><div>Lead Time</div><div>Default</div><div>Status</div>
                    </div>
                    {(viewing.productSuppliers ?? []).flatMap((link: any) =>
                      (link.supplierUnits ?? []).map((supplierUnit: any) => (
                        <div className="supplier-price-row view-supplier-unit-columns" key={supplierUnit.productSupplierUnitId}>
                          <div>{link.supplier?.supplierName ?? link.supplier?.name ?? "—"}</div>
                          <div>{supplierUnit.productUnit?.unit?.name ?? supplierUnit.productUnit?.unit?.code ?? "—"}</div>
                          <div>{supplierUnit.supplierProductCode ?? "—"}</div>
                          <div>{supplierUnit.minimumOrderQty ?? "—"}</div>
                          <div>{supplierUnit.leadTimeDays != null ? `${supplierUnit.leadTimeDays} days` : "—"}</div>
                          <div>{supplierUnit.isDefaultPurchaseUnit ? <span className="preferred-badge">Default</span> : "—"}</div>
                          <div className={supplierUnit.isActive !== false ? "supplier-price-status active" : "supplier-price-status inactive"}>
                            <span className="status-dot" /> {supplierUnit.isActive !== false ? "Active" : "Inactive"}
                          </div>
                        </div>
                      )),
                    )}
                    {(viewing.productSuppliers ?? []).every((link: any) => !(link.supplierUnits ?? []).length) && (
                      <div className="empty">No supplier purchase units have been added.</div>
                    )}
                  </div>
                </>
              )}

              {(viewing.productSuppliers ?? []).length > 0 && (
                <>
                  <h4 className="product-view-supplier-subtitle">Purchase Prices</h4>
                  {viewSupplierSummaryLoading && <div className="empty">Loading supplier purchase prices...</div>}
                  {viewSupplierSummaryError && <div className="error-banner">{viewSupplierSummaryError}</div>}
                  {!viewSupplierSummaryLoading && !viewSupplierSummaryError && viewSupplierSummary.length > 0 && (
                    <div className="supplier-price-table product-view-supplier-table">
                      <div className="supplier-price-row view-supplier-price-columns supplier-price-table-head">
                        <div>Supplier</div><div>Purchase Unit</div><div>Current Purchase Price</div><div>Currency</div><div>Effective From</div><div>Effective To / Status</div><div>Next Scheduled Price</div>
                      </div>
                      {viewSupplierSummary.map((item: any) => (
                        <div className="supplier-price-row view-supplier-price-columns" key={`${item.productSupplierUnitId}-${item.current?.currencyCode ?? item.nextScheduled?.currencyCode}`}>
                          <div>{item.supplier?.supplierName ?? "—"}</div>
                          <div>{item.productUnit?.unit?.name ?? item.productUnit?.unit?.code ?? "—"}</div>
                          <div>{item.current ? displayMoney(item.current.currencyCode, item.current.purchasePrice) : "—"}</div>
                          <div>{item.current?.currencyCode ?? item.nextScheduled?.currencyCode ?? "—"}</div>
                          <div>{item.current ? displayDateTime(item.current.effectiveFrom) : "—"}</div>
                          <div>{item.current ? <><span className="status status-on">Current</span><small>{item.current.effectiveTo ? `Until ${displayDateTime(item.current.effectiveTo)}` : "No end date"}</small></> : "—"}</div>
                          <div>{item.nextScheduled ? <><strong>{displayMoney(item.nextScheduled.currencyCode, item.nextScheduled.purchasePrice)}</strong><small>From {displayDateTime(item.nextScheduled.effectiveFrom)}</small></> : "—"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!viewSupplierSummaryLoading && !viewSupplierSummaryError && viewSupplierSummary.length === 0 && (
                    <div className="empty">No current or scheduled supplier purchase prices.</div>
                  )}
                </>
              )}

              {(viewing.productSuppliers ?? []).length === 0 && (
                <div className="empty">No supplier purchase configuration has been added.</div>
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
            onClick={closeProductView}
          >
            Back to Product List
          </button>
          {permissions.includes("PRODUCT_DEACTIVATE") && (
            <button className="btn btn-secondary" onClick={() => { setConfirming(viewing); closeProductView(); }}>
              {viewing?.isActive !== false ? "Deactivate Product" : "Activate Product"}
            </button>
          )}
          {permissions.includes("PRODUCT_UPDATE") && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const productId = Number(id(viewing, "productId"));
                closeProductView();
                selectForUpdate(productId);
              }}
            >
              Edit Product
            </button>
          )}
        </div>
      </Modal>

      <Modal
        open={viewSupplierHistoryOpen}
        onClose={() => !viewSupplierHistoryLoading && setViewSupplierHistoryOpen(false)}
        title="Purchase Price History"
        subtitle={viewing ? `${viewing.sku} — ${viewing.productName}` : ""}
        wide
      >
        <div className="modal-body">
          {viewSupplierHistoryLoading && <div className="empty">Loading purchase price history...</div>}
          {viewSupplierHistoryError && <div className="error-banner">{viewSupplierHistoryError}</div>}
          {!viewSupplierHistoryLoading && !viewSupplierHistoryError && (viewSupplierHistory?.items.length ?? 0) > 0 && (
            <div className="supplier-price-table product-view-supplier-table">
              <div className="supplier-price-row view-supplier-history-columns supplier-price-table-head">
                <div>Supplier</div><div>Purchase Unit</div><div>Cost</div><div>Effective Period</div><div>Status</div>
              </div>
              {viewSupplierHistory?.items.map((item: any) => (
                <div className="supplier-price-row view-supplier-history-columns" key={item.productSupplierPriceId}>
                  <div>{item.supplier?.supplierName ?? "—"}</div>
                  <div>{item.productUnit?.unit?.name ?? item.productUnit?.unit?.code ?? "—"}</div>
                  <div>{displayMoney(item.currencyCode, item.purchasePrice)}</div>
                  <div>{displayDateTime(item.effectiveFrom)} – {displayDateTime(item.effectiveTo)}</div>
                  <div><span className={item.status === "CURRENT" ? "status status-on" : item.status === "FUTURE" ? "status status-warn" : "status status-off"}>{item.status}</span></div>
                </div>
              ))}
            </div>
          )}
          {!viewSupplierHistoryLoading && !viewSupplierHistoryError && viewSupplierHistory && viewSupplierHistory.items.length === 0 && (
            <div className="empty">No supplier purchase-price history.</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={() => loadViewSupplierHistory((viewSupplierHistory?.page ?? 1) - 1)} disabled={viewSupplierHistoryLoading || (viewSupplierHistory?.page ?? 1) <= 1}>Previous</button>
          <span>Page {viewSupplierHistory?.page ?? 1} of {viewSupplierHistory?.totalPages ?? 1}</span>
          <button className="btn btn-secondary" onClick={() => loadViewSupplierHistory((viewSupplierHistory?.page ?? 1) + 1)} disabled={viewSupplierHistoryLoading || (viewSupplierHistory?.page ?? 1) >= (viewSupplierHistory?.totalPages ?? 1)}>Next</button>
          <button className="btn btn-primary" onClick={() => setViewSupplierHistoryOpen(false)} disabled={viewSupplierHistoryLoading}>Close</button>
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
        onClose={() => !busy && closeWizard()}
        title={mode === "update" ? "Update Product" : "Create Product"}
        subtitle="Set up the product master and its related commercial configuration."
        fullScreen
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
                {mode === "update" && <div className="section-action-row"><span className={`status ${generalDirty ? "status-warn" : "status-on"}`}>{generalDirty ? "Unsaved changes" : "Saved"}</span><button type="button" className="btn btn-primary" disabled={busy || !validGeneral || !generalDirty} onClick={() => void saveUpdateSection("general")}>Save General Changes</button></div>}
                <div className="form-grid">
                  <Field
                    label="SKU"
                    value={
                      mode === "create" ? "Generated automatically" : form.sku
                    }
                    onChange={() => {}}
                    disabled
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
                  <SearchableSelect
                    label="Category"
                    value={form.categoryId}
                    onChange={(v) => setForm({ ...form, categoryId: v })}
                    options={categoryOptions}
                    required
                    placeholder="Search category..."
                    emptyMessage="No categories found"
                    selectedLabel={(categories.data ?? []).find((row: any) => String(id(row, "categoryId")) === form.categoryId)?.categoryName ?? (categories.data ?? []).find((row: any) => String(id(row, "categoryId")) === form.categoryId)?.name}
                  />
                  <SearchableSelect
                    label="Brand"
                    value={form.brandId}
                    onChange={(v) => setForm({ ...form, brandId: v })}
                    options={brandOptions}
                    placeholder="Search brand..."
                    emptyMessage="No brands found"
                    clearLabel="No brand"
                    selectedLabel={(brands.data ?? []).find((row: any) => String(id(row, "brandId")) === form.brandId)?.brandName ?? (brands.data ?? []).find((row: any) => String(id(row, "brandId")) === form.brandId)?.name}
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
                    onChange={selectBaseUnit}
                    options={unitOptions}
                    required
                    disabled={mode === "update"}
                    hint={mode === "update" ? "Base unit cannot be changed after product creation." : undefined}
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
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      />{" "}
                      Active
                    </label>
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

          {step === 2 && (
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
                  style={{ gridTemplateColumns: "1fr 1.5fr 1.2fr .7fr 35px" }}
                >
                  <span>Type</span>
                  <span>Identifier</span>
                  <span>Applies to Unit</span>
                  <span>Primary</span>
                  <span />
                </div>
                {identifiers.map((x, i) => (
                  <div
                    className="mini-row"
                    key={i}
                    style={{ gridTemplateColumns: "1fr 1.5fr 1.2fr .7fr 35px" }}
                  >
                    <select
                      className="control"
                      value={x.identifierTypeId}
                      onChange={(e) => {
                        const a = [...identifiers];
                        const selectedType = identifierTypeOptions.find((option) => String(option.value) === e.target.value);
                        const requiresBase = posIdentifierCodes.has(selectedType?.code ?? "");
                        a[i] = { ...x, identifierTypeId: e.target.value, productUnitId: requiresBase ? String(productUnits.find((unit) => unit.isBaseUnit && unit.isActive)?.productUnitId ?? "") : x.productUnitId };
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
                    <div className="identifier-input-cell">
                      <input
                        className={identifierErrors[i] ? "control control-error" : "control"}
                        value={x.identifierValue}
                        placeholder="049000028904"
                        onChange={(e) => {
                          const a = [...identifiers];
                          a[i] = { ...x, identifierValue: e.target.value };
                          setIdentifiers(a);
                          setIdentifierErrors((errors) => {
                            const next = { ...errors };
                            delete next[i];
                            return next;
                          });
                          setError("");
                        }}
                      />
                      {identifierErrors[i] && <span className="error-text">{identifierErrors[i]}</span>}
                    </div>
                    <select
                      className="control"
                      value={x.productUnitId ?? ""}
                      onChange={(event) => setIdentifiers((rows) => rows.map((row, rowIndex) => rowIndex === i ? { ...row, productUnitId: event.target.value || undefined } : row))}
                    >
                      <option value="">Product level</option>
                      {productUnits.filter((unit) => unit.isBaseUnit && unit.isActive && unit.productUnitId).map((unit) => (
                        <option key={unit.productUnitId} value={unit.productUnitId}>{unitOptions.find((option) => String(option.value) === unit.unitId)?.label ?? "Base unit"}</option>
                      ))}
                    </select>
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
                      onClick={() => {
                        setIdentifiers(identifiers.filter((_, j) => j !== i));
                        setIdentifierErrors({});
                        setError("");
                      }}
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
              {mode === "update" && <div className="section-action-row"><span className={`status ${unitsDirty || identifiersDirty ? "status-warn" : "status-on"}`}>{unitsDirty ? "Blocked by unsaved Unit changes" : identifiersDirty ? "Unsaved changes" : "Saved"}</span><button type="button" className="btn btn-primary" disabled={busy || unitsDirty || !validIdentifiers || !identifiersDirty} onClick={() => void saveUpdateSection("identifiers")}>Save Identifiers</button></div>}
            </Section>
          )}

          {step === 1 && (
            <Section
              title="Packaging / units"
              description="Define purchase and sales units and conversion to the base unit."
            >
              <p className="unit-help">Example: CASE-24 = 24 EACH. The General step base unit is kept exactly once with conversion factor 1.</p>
              <div className="mini-table">
                <div className="mini-head units">
                  <span>Unit</span>
                  <span>Conversion to base</span>
                  <span>Base</span>
                  <span>Purchase</span>
                  <span>Sales</span>
                  <span>Status</span>
                  <span />
                </div>
                {productUnits.map((x, i) => (
                  <div className="mini-row units" key={i}>
                    <select
                      className="control"
                      value={x.unitId}
                      disabled={!x.isActive || x.isBaseUnit || Boolean(x.hasReferences)}
                      onChange={(e) => {
                        const a = [...productUnits];
                        a[i] = { ...x, unitId: e.target.value };
                        setUnitError("");
                        setProductUnits(a);
                      }}
                    >
                      <option value="">Select...</option>
                      {unitOptions.filter((option) => String(option.value) === x.unitId || !productUnits.some((unit, unitIndex) => unitIndex !== i && unit.unitId === String(option.value))).map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="control"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={x.conversionFactor}
                      disabled={!x.isActive || Boolean(x.isBaseUnit && x.baseUnitLocked)}
                      onChange={(e) => {
                        const a = [...productUnits];
                        a[i] = { ...x, conversionFactor: e.target.value };
                        setUnitError("");
                        setProductUnits(a);
                      }}
                    />
                    <span>{x.isBaseUnit ? <span className="base-unit-badge">Base unit</span> : "—"}</span>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={x.isPurchaseUnit}
                        disabled={!x.isActive}
                        onChange={(e) => {
                          const a = [...productUnits];
                          a[i] = { ...x, isPurchaseUnit: e.target.checked };
                          setProductUnits(a);
                        }}
                      />{" "}
                      ✓
                    </label>
                    <span>{x.isBaseUnit ? <span className="status status-on"><i /> Base sales unit</span> : <span className="muted">Purchase only</span>}</span>
                    <span className={x.isActive ? "status status-on" : "status status-off"}><i /> {x.isActive ? "Active" : "Inactive"}</span>
                    <div className="unit-row-actions">
                      {!x.isBaseUnit && x.productUnitId && <button type="button" className="btn btn-ghost btn-compact" onClick={() => setProductUnitActive(i, !x.isActive)}>{x.isActive ? "Deactivate" : "Activate"}</button>}
                      {!x.isBaseUnit && <button type="button" className="icon-btn" title="Remove unit" onClick={() => removeProductUnit(x, i)}>×</button>}
                    </div>
                  </div>
                ))}
              </div>
              {unitError && <div className="error-box unit-error">{unitError}</div>}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addUnit}
              >
                ＋ Add unit
              </button>
              {mode === "update" && <div className="section-action-row"><span className={`status ${unitsDirty ? "status-warn" : "status-on"}`}>{unitsDirty ? "Unsaved changes" : "Saved"}</span><button type="button" className="btn btn-primary" disabled={busy || !validUnits || !unitsDirty} onClick={() => void saveUpdateSection("units")}>Save Unit Changes</button></div>}
            </Section>
          )}

          {mode === "update" && editingId && (
            <div hidden={step !== 3}><ProductSellingPricesUpdate
              productId={editingId}
              productUnits={productUnits}
              priceListOptions={priceListOptions}
              unitOptions={unitOptions}
              unitsDirty={unitsDirty}
            /></div>
          )}
          {step === 3 && mode === "create" && (
            <Section
              title="Selling Prices"
              description="Customer selling prices use the product base unit. Minimum quantity is fixed at 1 for the current MVP."
            >
              <div className="mini-table selling-price-grid">
                <div className="mini-head price-history">
                  <span>Price list</span>
                  <span>Unit</span>
                  <span>Selling price</span>
                  <span className="mvp-hidden-column">Minimum qty</span>
                  <span className="mvp-hidden-column">Currency</span>
                  <span>Effective from</span>
                  <span className="mvp-hidden-column">Effective to</span>
                  <span>Status</span>
                  <span className="actions-head">Actions</span>
                </div>
                {sellingDisplayRows.map(({ row: x, index: i }) => (
                  <div hidden={Boolean(x.priceListItemId && visiblePriceStatus(x) !== "Current" && !expandedSellingHistory)} className={`mini-row price-history${x.pendingRemoval ? " pending-removal" : ""}`} key={i}>
                    <select
                      className="control"
                      value={x.priceListId}
                      disabled={Boolean(x.priceListItemId)}
                      onChange={(e) => updateSellingPrice(i, { priceListId: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {priceListOptions.map((o) => (
                        <option key={String(o.value)} value={String(o.value)}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input className="control" value={salesUnitOptions.find((o) => String(o.value) === x.unitId)?.label ?? "Select a base unit first"} readOnly disabled />
                    {x.priceListItemId ? <strong className="formatted-price-cell">{displayMoney(x.currencyCode, x.sellingPrice)}</strong> : <input
                      className="control"
                      type="number"
                      step="0.01"
                      value={x.sellingPrice}
                      disabled={Boolean(x.priceListItemId)}
                      placeholder="250.00"
                      onChange={(e) => updateSellingPrice(i, { sellingPrice: e.target.value })}
                    />}
                    <input
                      aria-hidden="true"
                      className="control mvp-hidden-column"
                      type="number"
                      min="1"
                      value={x.minimumQuantity}
                      disabled={Boolean(x.priceListItemId)}
                      onChange={(e) => updateSellingPrice(i, { minimumQuantity: e.target.value })}
                    />
                    <input aria-hidden="true" className="control mvp-hidden-column" value={x.currencyCode} disabled />
                    {x.priceListItemId ? <span>{displayDate(x.effectiveFrom)}</span> : <input className="control" type="date" value={x.effectiveFrom} onChange={(e) => updateSellingPrice(i, { effectiveFrom: e.target.value })} />}
                    <input aria-hidden="true" className="control mvp-hidden-column" type="date" value={x.effectiveTo ?? ""} disabled />
                    <span className={`status ${visiblePriceStatus(x) === "Current" ? "status-on" : visiblePriceStatus(x) === "Future" ? "status-warn" : "status-off"}`}>{x.pendingRemoval ? "Pending deletion" : visiblePriceStatus(x)}</span>
                    {x.priceListItemId && !x.pendingRemoval && (
                      <div className="price-action-stack"><button type="button" className="btn btn-secondary btn-compact" disabled={busy || visiblePriceStatus(x) !== "Current"} onClick={() => changeSellingPrice(x, i)}>Change Price</button><button type="button" className="btn btn-ghost btn-compact" disabled={busy || visiblePriceStatus(x) === "Ended"} onClick={() => endSellingPrice(x, i)}>End Price</button></div>
                    )}
                    {!x.priceListItemId && <button
                      type="button"
                      className="btn btn-danger btn-compact price-remove-button"
                      data-label={x.pendingRemoval ? "Undo" : x.priceListItemId ? "Delete" : "Remove"}
                      disabled={busy}
                      onClick={() => x.pendingRemoval ? undoSellingPriceRemoval(x, i) : void removeSellingPrice(x, i)}
                      title={x.pendingRemoval ? "Keep saved price" : x.priceListItemId ? "Delete saved price" : "Remove new price"}
                    >
                      ×
                    </button>}
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
            </Section>
          )}

          {step === 4 && mode === "update" && editingId && (
            <ProductSupplierPricesUpdate productId={editingId} productUnits={productUnits} supplierOptions={supplierOptions} unitOptions={unitOptions} unitsDirty={unitsDirty} />
          )}

          {step === 4 && mode === "create" && (
            <Section title="Suppliers & Purchase Prices" description="Set up approved suppliers, their purchase units, and initial costs.">
              <div className="create-supplier-step">
                <div className="create-supplier-section-head">
                  <h3>Approved Suppliers</h3>
                  <button type="button" className="btn btn-primary" onClick={() => setSupplierDraft({ supplierId: "", isPrimarySupplier: createSuppliers.length === 0 })}>+ Add Supplier</button>
                </div>
                <div className="supplier-price-table create-approved-table">
                  <div className="supplier-price-row supplier-price-table-head create-approved-columns">
                    <span>Supplier Name</span><span>Supplier Code</span><span>Primary</span><span>Status</span><span>Actions</span>
                  </div>
                  {createSuppliers.map((supplier) => {
                    const option = supplierDisplay(supplier.supplierId);
                    return <div className={`supplier-price-row create-approved-columns${effectiveCreateSupplierId === supplier.supplierId ? " selected" : ""}`} key={supplier.supplierId} onClick={() => setSelectedCreateSupplierId(supplier.supplierId)}>
                      <strong>{option?.name ?? option?.label ?? supplier.supplierId}</strong>
                      <span>{option?.code ?? "—"}</span>
                      <span>{supplier.isPrimarySupplier ? <span className="create-blue-badge">Primary</span> : "—"}</span>
                      <span className={supplier.isActive ? "create-active-status" : "create-inactive-status"}><i />{supplier.isActive ? "Active" : "Inactive"}</span>
                      <div>
                        <button type="button" className="create-table-action" onClick={(event) => { event.stopPropagation(); setSupplierDraft({ originalSupplierId: supplier.supplierId, supplierId: supplier.supplierId, isPrimarySupplier: supplier.isPrimarySupplier }); }}>Edit</button>
                        <span className="create-action-divider">|</span>
                        <button type="button" className="create-table-action danger" disabled={!supplier.isActive} onClick={(event) => { event.stopPropagation(); deactivateCreateSupplier(supplier.supplierId); }}>Deactivate</button>
                      </div>
                    </div>;
                  })}
                  {!createSuppliers.length && <div className="create-table-empty">No approved suppliers added.</div>}
                </div>

                <div className="create-supplier-section-head create-subsection-head">
                  <h3>Supplier Purchase Units for {supplierDisplay(effectiveCreateSupplierId)?.name ?? supplierDisplay(effectiveCreateSupplierId)?.label ?? "Selected Supplier"}</h3>
                  <button type="button" className="btn btn-primary" disabled={!effectiveCreateSupplierId || !activeCreateSupplierIds.has(effectiveCreateSupplierId)} onClick={() => setSupplierUnitDraft({ supplierId: effectiveCreateSupplierId, unitId: "", supplierProductCode: "", minimumOrderQty: "1", leadTimeDays: "", isDefaultPurchaseUnit: !createSupplierUnits.some((unit) => unit.supplierId === effectiveCreateSupplierId && unit.isActive) })}>+ Add Purchase Unit</button>
                </div>
                <div className="supplier-price-table create-unit-table">
                  <div className="supplier-price-row supplier-price-table-head create-unit-columns">
                    <span>Supplier</span><span>Purchase Unit</span><span>Supplier Item Code</span><span>MOQ</span><span>Lead Time</span><span>Default</span><span>Status</span><span>Actions</span>
                  </div>
                  {createSupplierUnits.filter((unit) => unit.supplierId === effectiveCreateSupplierId).map((unit) => {
                    const option = supplierDisplay(unit.supplierId);
                    return <div className="supplier-price-row create-unit-columns" key={`${unit.supplierId}:${unit.unitId}`}>
                      <span>{option?.name ?? option?.label}</span>
                      <strong>{unitDisplay(unit.unitId)}</strong>
                      <span>{unit.row.supplierProductCode || "—"}</span>
                      <span>{unit.row.minimumOrderQty || "—"}</span>
                      <span>{unit.row.leadTimeDays ? `${unit.row.leadTimeDays} days` : "—"}</span>
                      <span>{unit.row.isDefaultPurchaseUnit ? <span className="create-blue-badge">Default</span> : "—"}</span>
                      <span className={unit.isActive ? "create-active-status" : "create-inactive-status"}><i />{unit.isActive ? "Active" : "Inactive"}</span>
                      <div>
                        <button type="button" className="create-table-action" onClick={() => setSupplierUnitDraft({ originalUnitId: unit.unitId, supplierId: unit.supplierId, unitId: unit.unitId, supplierProductCode: unit.row.supplierProductCode, minimumOrderQty: unit.row.minimumOrderQty, leadTimeDays: unit.row.leadTimeDays, isDefaultPurchaseUnit: Boolean(unit.row.isDefaultPurchaseUnit) })}>Edit</button>
                        <span className="create-action-divider">|</span>
                        <button type="button" className="create-table-action danger" disabled={!unit.isActive} onClick={() => deactivateCreateSupplierUnit(unit.supplierId, unit.unitId)}>Deactivate</button>
                      </div>
                    </div>;
                  })}
                  {!createSupplierUnits.some((unit) => unit.supplierId === effectiveCreateSupplierId) && <div className="create-table-empty">No purchase units added for this supplier.</div>}
                </div>

                <div className="create-supplier-section-head create-subsection-head">
                  <h3>Initial Purchase Prices</h3>
                  <button type="button" className="btn btn-primary" disabled={!activeCreateUnitKeys.size} onClick={() => {
                    const firstUnit = createSupplierUnits.find((unit) => unit.isActive && activeCreateSupplierIds.has(unit.supplierId));
                    setInitialPriceDraft({ supplierId: effectiveCreateSupplierId || firstUnit?.supplierId || "", unitId: firstUnit?.supplierId === effectiveCreateSupplierId ? firstUnit.unitId : "", purchasePrice: "", currencyCode: "LKR" });
                  }}>+ Add Initial Price</button>
                </div>
                <div className="supplier-price-table create-price-table">
                  <div className="supplier-price-row supplier-price-table-head create-price-columns">
                    <span>Supplier</span><span>Purchase Unit</span><span>Initial Purchase Price</span><span>Effective From</span>
                  </div>
                  {createInitialPrices.map(({ row, index }) => <div className="supplier-price-row create-price-columns" key={`initial-price-${index}`}>
                    <span>{supplierDisplay(row.supplierId)?.name ?? supplierDisplay(row.supplierId)?.label}</span>
                    <strong>{unitDisplay(row.unitId)}</strong>
                    <span>{displayMoney(row.currencyCode, row.purchasePrice)}</span>
                    <span>On product creation</span>
                  </div>)}
                  {!createInitialPrices.length && <div className="create-table-empty">No initial purchase prices added.</div>}
                </div>
                {pricingError && <div className="error-box create-supplier-error">{pricingError}</div>}
              </div>
              <div className="section-action-row">
                <p className="section-desc">Add one supplier relationship and its initial purchase price.</p>
                <button type="button" className="btn btn-primary" onClick={addSupplierPrice}>+ Add Supplier</button>
              </div>
              <div className="supplier-card-list">
                {supplierGroups.map(({ key, entries }) => {
                  const first = entries[0];
                  const current = entries.find(({ row }) => visiblePriceStatus(row) === "Current") ?? entries.find(({ row }) => !row.productSupplierPriceId) ?? first;
                  const history = entries.filter((entry) => entry !== current);
                  const editing = !first.row.productSupplierId || editingSupplierKeys.includes(key);
                  const supplierName = supplierOptions.find((option) => String(option.value) === first.row.supplierId)?.label ?? "New supplier";
                  return <article className="supplier-business-card" key={key}>
                    <header><div><h3>{supplierName}</h3>{first.row.isPrimarySupplier && <span className="preferred-badge">Preferred Supplier</span>}</div><span className={`status ${visiblePriceStatus(current.row) === "Current" ? "status-on" : "status-warn"}`}>{visiblePriceStatus(current.row)}</span></header>
                    {editing ? <div className="supplier-card-editor form-grid compact-grid">
                      <Field label="Supplier" value={first.row.supplierId} onChange={(value) => updateSupplierLink(first.index, { supplierId: value })} options={supplierOptions.filter((option) => !supplierGroups.some((group) => group.key !== key && group.entries.some(({ row }) => row.supplierId === String(option.value))))} required disabled={Boolean(first.row.productSupplierId)} />
                      <Field label="Supplier Item Code" value={first.row.supplierProductCode} onChange={(value) => updateSupplierLink(first.index, { supplierProductCode: value })} />
                      <Field label="Purchase Unit" value={first.row.unitId} onChange={(value) => updateSupplierLink(first.index, { unitId: value })} options={purchaseUnitOptions} required disabled={Boolean(first.row.productSupplierPriceId)} />
                      <Field label="Lead Time Days" type="number" value={first.row.leadTimeDays} onChange={(value) => updateSupplierLink(first.index, { leadTimeDays: value })} />
                      <Field label="Minimum Order Quantity" type="number" value={first.row.minimumOrderQty} onChange={(value) => updateSupplierLink(first.index, { minimumOrderQty: value })} />
                      {!first.row.productSupplierPriceId && <><Field label="Purchase Price" type="number" value={first.row.purchasePrice} onChange={(value) => updateSupplierPrice(first.index, { purchasePrice: value })} required /><Field label="Effective From" type="date" value={first.row.effectiveFrom} onChange={(value) => updateSupplierPrice(first.index, { effectiveFrom: value })} required /></>}
                      <label className="check"><input type="checkbox" checked={first.row.isPrimarySupplier} onChange={(event) => selectPrimarySupplier(first.index, event.target.checked)} /> Preferred Supplier</label>
                    </div> : <div className="supplier-card-facts"><span><small>Purchase unit</small><strong>{purchaseUnitOptions.find((option) => String(option.value) === first.row.unitId)?.label ?? "—"}</strong></span><span><small>Lead time</small><strong>{first.row.leadTimeDays ? `${first.row.leadTimeDays} days` : "Not configured"}</strong></span><span><small>MOQ</small><strong>{first.row.minimumOrderQty || "Not configured"}</strong></span><span><small>Supplier item code</small><strong>{first.row.supplierProductCode || "Not configured"}</strong></span></div>}
                    {current.row.productSupplierPriceId && <div className="current-purchase-price"><small>Current purchase price</small><strong>{displayMoney(current.row.currencyCode, current.row.purchasePrice)} <em>/ {purchaseUnitOptions.find((option) => String(option.value) === current.row.unitId)?.label ?? "unit"}</em></strong><span>From {displayDate(current.row.effectiveFrom)}</span></div>}
                    {entries.filter(({ row }) => !row.productSupplierPriceId).map(({ row, index }) => first.index === index && !first.row.productSupplierPriceId ? null : <div className="inline-price-editor" key={`new-purchase-${index}`}><Field label="New Purchase Price" type="number" value={row.purchasePrice} onChange={(value) => updateSupplierPrice(index, { purchasePrice: value })} required /><Field label="Effective From" type="date" value={row.effectiveFrom} onChange={(value) => updateSupplierPrice(index, { effectiveFrom: value })} required /><button type="button" className="btn btn-ghost" onClick={() => void removeSupplierPrice(row, index)}>Remove</button></div>)}
                    <div className="card-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditingSupplierKeys((keys) => keys.includes(key) ? keys.filter((value) => value !== key) : [...keys, key])}>{editing && first.row.productSupplierId ? "Done" : "Edit Supplier"}</button>{current.row.productSupplierPriceId && <button type="button" className="btn btn-secondary" onClick={() => changeSupplierPurchasePrice(current.row, current.index)}>Change Price</button>}<button type="button" className="btn btn-ghost" onClick={() => setExpandedSupplierHistory((keys) => keys.includes(key) ? keys.filter((value) => value !== key) : [...keys, key])}>{expandedSupplierHistory.includes(key) ? "Hide" : "View"} Price History</button><button type="button" className="btn btn-ghost danger-text" onClick={() => { if (first.row.productSupplierId && !window.confirm("Remove this supplier from the product? Existing price history will be retained and the relationship deactivated.")) return; const indexes = new Set(entries.map((entry) => entry.index)); setSupplierPrices((rows) => rows.filter((_, index) => !indexes.has(index))); }}>Remove Supplier</button></div>
                    {expandedSupplierHistory.includes(key) && <div className="history-list">{history.map(({ row, index }) => <div className="history-row" key={row.productSupplierPriceId ?? `supplier-history-${index}`}><strong>{displayMoney(row.currencyCode, row.purchasePrice)}</strong><span>{displayDate(row.effectiveFrom)} – {displayDate(row.effectiveTo)}</span><span className={`status ${visiblePriceStatus(row) === "Future" ? "status-warn" : "status-off"}`}>{visiblePriceStatus(row)}</span>{row.productSupplierPriceId && visiblePriceStatus(row) !== "Ended" && <button type="button" className="btn btn-ghost" onClick={() => endSupplierPrice(row, index)}>End Price</button>}</div>)}</div>}
                  </article>;
                })}
                {!supplierGroups.length && <div className="empty">No suppliers added. Purchasable products require at least one supplier and purchase price.</div>}
              </div>
              <div className="legacy-supplier-price-grid" aria-hidden="true">
              <div style={{ marginTop: 24 }}>
                <h3>Supplier purchase prices</h3>
                <p className="section-desc">
                  Record what each supplier charges for a product unit.
                </p>
              </div>
              <div className="mini-table">
                <div className="mini-head supplier-price-history">
                  <span>Supplier / item code</span>
                  <span>Purchase unit / primary</span>
                  <span>Purchase price / lead time</span>
                  <span>Minimum order qty</span>
                  <span>Currency</span>
                  <span>Effective from</span>
                  <span>Effective to</span>
                  <span>Status</span>
                  <span className="actions-head">Actions</span>
                </div>
                {supplierPrices.map((x, i) => (
                  <div className={`mini-row supplier-price-history${x.pendingRemoval ? " pending-removal" : ""}`} key={i}>
                    <div className="supplier-link-stack">
                      <select
                        className="control"
                        value={x.supplierId}
                        disabled={Boolean(x.productSupplierPriceId)}
                        onChange={(e) => updateSupplierPrice(i, { supplierId: e.target.value })}
                      >
                        <option value="">Select...</option>
                        {supplierOptions.map((o) => (
                          <option key={String(o.value)} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <label>Supplier item code</label>
                      <input className="control" value={x.supplierProductCode} disabled={x.pendingRemoval} placeholder="Optional" onChange={(e) => updateSupplierLink(i, { supplierProductCode: e.target.value })} />
                    </div>
                    <div className="supplier-link-stack">
                      <select
                        className="control"
                        value={x.unitId}
                        disabled={Boolean(x.productSupplierPriceId)}
                        onChange={(e) => updateSupplierPrice(i, { unitId: e.target.value })}
                      >
                        <option value="">Select...</option>
                        {unitOptions.map((o) => (
                          <option key={String(o.value)} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <label className="check supplier-primary-check">
                        <input type="checkbox" checked={x.isPrimarySupplier} disabled={x.pendingRemoval || !x.supplierId || !x.unitId} onChange={(e) => selectPrimarySupplier(i, e.target.checked)} />
                        Primary supplier
                      </label>
                    </div>
                    <div className="supplier-link-stack">
                      <input
                        className="control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={x.purchasePrice}
                        disabled={Boolean(x.productSupplierPriceId)}
                        placeholder="200.00"
                        onChange={(e) => updateSupplierPrice(i, { purchasePrice: e.target.value })}
                      />
                      <label>Lead time override (days)</label>
                      <input className="control" type="number" min="0" step="1" value={x.leadTimeDays} disabled={x.pendingRemoval} placeholder="Not configured" onChange={(e) => updateSupplierLink(i, { leadTimeDays: e.target.value })} />
                    </div>
                    <div className="supplier-link-stack">
                      <input className="control" type="number" min="0.000001" step="any" value={x.minimumOrderQty} disabled={x.pendingRemoval} placeholder="Optional" onChange={(e) => updateSupplierLink(i, { minimumOrderQty: e.target.value })} />
                    </div>
                    <input className="control" value={x.currencyCode} maxLength={3} disabled={Boolean(x.productSupplierPriceId)} onChange={(e) => updateSupplierPrice(i, { currencyCode: e.target.value.toUpperCase() })} />
                    <input className="control" type="date" value={x.effectiveFrom} disabled={Boolean(x.productSupplierPriceId)} onChange={(e) => updateSupplierPrice(i, { effectiveFrom: e.target.value })} />
                    <input className="control" type="date" value={x.effectiveTo ?? ""} disabled={x.pendingRemoval} onChange={(e) => updateSupplierPrice(i, { effectiveTo: e.target.value })} />
                    <span className="status status-on">{x.pendingRemoval ? "Pending deletion" : x.effectiveStatus ?? "New"}</span>
                    {x.productSupplierPriceId && !x.pendingRemoval && (
                      <button type="button" className="btn btn-secondary btn-compact" disabled={busy} onClick={() => endSupplierPrice(x, i)}>
                        End Price
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-compact price-remove-button"
                      data-label={x.pendingRemoval ? "Undo" : x.productSupplierPriceId ? "Delete" : "Remove"}
                      disabled={busy}
                      onClick={() => x.pendingRemoval ? undoSupplierPriceRemoval(x, i) : void removeSupplierPrice(x, i)}
                      title={x.pendingRemoval ? "Keep saved supplier price" : x.productSupplierPriceId ? "Delete saved supplier price" : "Remove new price"}
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
              </div>
              {pricingError && <div className="error-box">{pricingError}</div>}
            </Section>
          )}

          {step === 5 && (
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
                    <div className="location-search-cell">
                      <SearchableSelect
                        label="Location"
                        value={x.locationId}
                        onChange={(value) => {
                        const a = [...locations];
                        a[i] = { ...x, locationId: value };
                        setLocations(a);
                      }}
                        options={locationOptions.filter((option) =>
                          String(option.value) === x.locationId ||
                          !locations.some((location, index) => index !== i && location.locationId === String(option.value))
                        )}
                        placeholder="Search locations..."
                        emptyMessage="No available locations."
                        required
                      />
                    </div>
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
                disabled={new Set(selectedLocationIds).size >= locationOptions.length}
                onClick={addLocation}
              >
                ＋ Add location
              </button>
              {mode === "update" && <div className="section-action-row"><span className={`status ${locationsDirty ? "status-warn" : "status-on"}`}>{locationsDirty ? "Unsaved changes" : "Saved"}</span><button type="button" className="btn btn-primary" disabled={busy || !validLocations || !locationsDirty} onClick={() => void saveUpdateSection("locations")}>Save Location Changes</button></div>}
            </Section>
          )}
          {step === 6 && (
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
                  <div className="attribute-search-cell">
                    <SearchableSelect
                      label="Attribute"
                      value={x.attributeId}
                      onChange={(value) => {
                      const rows = [...productAttributes];
                      rows[i] = { ...x, attributeId: value };
                      setProductAttributes(rows);
                    }}
                      options={attributeOptions.filter((option) =>
                        String(option.value) === x.attributeId ||
                        !productAttributes.some((attribute, index) => index !== i && attribute.attributeId === String(option.value))
                      )}
                      placeholder="Search attributes..."
                      emptyMessage="No available attributes."
                      required
                    />
                  </div>
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
                disabled={new Set(selectedAttributeIds).size >= attributeOptions.length}
                onClick={addAttribute}
              >
                ＋ Add attribute
              </button>
              {mode === "update" && <div className="section-action-row"><span className={`status ${attributesDirty ? "status-warn" : "status-on"}`}>{attributesDirty ? "Unsaved changes" : "Saved"}</span><button type="button" className="btn btn-primary" disabled={busy || !validAttributes || !attributesDirty} onClick={() => void saveUpdateSection("attributes")}>Save Attributes</button></div>}
            </Section>
          )}
          {step === 7 && (
            <Section
              title="Product Images"
              description="Images are optional. Add an image URL and choose one active image as Primary."
            >
              <div className="product-image-add">
                <div className="field">
                  <label>Image URL</label>
                  <input className="control" type="url" value={imageUrlDraft} placeholder="https://example.com/product.jpg" onChange={(event) => { setImageUrlDraft(event.target.value); setImageError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addImage(); } }} />
                </div>
                <button type="button" className="btn btn-secondary" onClick={addImage}>+ Add Image</button>
              </div>
              {imageError && <div className="error-box">{imageError}</div>}
              <div className="product-image-editor-grid">
                {images.map((image, index) => (
                  <div className={`product-image-editor${image.pendingRemoval ? " pending-removal" : ""}`} key={image.productImageId ?? `${image.imageUrl}-${index}`}>
                    <ProductImageVisual src={image.imageUrl} alt={image.altText || form.productName} className="product-image-editor-preview" />
                    <div className="product-image-editor-meta">
                      <input className="control" value={image.fileName ?? ""} disabled={image.pendingRemoval} placeholder="File name (optional)" onChange={(event) => setImages((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, fileName: event.target.value } : row))} />
                      <input className="control" value={image.altText ?? ""} disabled={image.pendingRemoval} placeholder="Alt text (optional)" onChange={(event) => setImages((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, altText: event.target.value } : row))} />
                      <input className="control" type="number" min="0" value={image.displayOrder} disabled={image.pendingRemoval} aria-label="Display order" onChange={(event) => setImages((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, displayOrder: Number(event.target.value) } : row))} />
                      {!image.pendingRemoval && <label className="check"><input type="radio" name="primary-product-image" checked={image.isPrimary} onChange={() => selectPrimaryImage(index)} /> Primary image</label>}
                      {mode === "update" && image.productImageId && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void saveImageMetadata(index)}>Save Image</button>}
                      <button type="button" className="btn btn-ghost" onClick={() => image.pendingRemoval ? undoImageRemoval(index) : void removeImage(index)}>{image.pendingRemoval ? "Undo" : image.productImageId ? "Deactivate" : "Remove"}</button>
                    </div>
                  </div>
                ))}
                {!images.length && <div className="empty">No product images. The product can be saved without images.</div>}
              </div>
            </Section>
          )}
          {error && <div className="error-box">{error}</div>}
          {success && <div className="success-box">{success}</div>}
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
              onClick={() => (step === 0 ? closeWizard() : setStep(step - 1))}
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            {step < steps.length - 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={goToNextStep}
              >
                Next
              </button>
            ) : mode === "update" ? (
              <button type="button" className="btn btn-primary" onClick={closeWizard}>Close</button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !setupValid}
                onClick={submit}
              >
                {busy ? "Creating..." : "Create Product"}
              </button>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(supplierDraft)} onClose={() => setSupplierDraft(null)} title={supplierDraft?.originalSupplierId ? "Edit Supplier" : "Add Supplier"}>
        <div className="modal-body">
          {supplierDraft && <div className="form-grid">
            <div className="field full">
              <SearchableSelect
                label="Supplier"
                value={supplierDraft.supplierId}
                onChange={(supplierId) => setSupplierDraft({ ...supplierDraft, supplierId })}
                options={supplierOptions.filter((option) => String(option.value) === supplierDraft.originalSupplierId || !createSupplierMap.has(String(option.value)))}
                placeholder="Search suppliers..."
                emptyMessage="No suppliers found."
                required
              />
            </div>
            <label className="check full"><input type="checkbox" checked={supplierDraft.isPrimarySupplier} onChange={(event) => setSupplierDraft({ ...supplierDraft, isPrimarySupplier: event.target.checked })} /> Primary supplier</label>
          </div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={() => setSupplierDraft(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!supplierDraft?.supplierId} onClick={saveCreateSupplier}>Save Supplier</button>
        </div>
      </Modal>

      <Modal open={Boolean(supplierUnitDraft)} onClose={() => setSupplierUnitDraft(null)} title={supplierUnitDraft?.originalUnitId ? "Edit Purchase Unit" : "Add Purchase Unit"}>
        <div className="modal-body">
          {supplierUnitDraft && <div className="form-grid">
            <Field label="Supplier" value={supplierUnitDraft.supplierId} onChange={() => {}} options={supplierOptions} disabled required />
            <div className="field">
              <SearchableSelect label="Purchase Unit" value={supplierUnitDraft.unitId} onChange={(unitId) => setSupplierUnitDraft({ ...supplierUnitDraft, unitId })} options={purchaseUnitOptions} placeholder="Search purchase units..." emptyMessage="No active purchase units found." required />
            </div>
            <Field label="Supplier Item Code" value={supplierUnitDraft.supplierProductCode} onChange={(supplierProductCode) => setSupplierUnitDraft({ ...supplierUnitDraft, supplierProductCode })} />
            <Field label="MOQ" type="number" value={supplierUnitDraft.minimumOrderQty} onChange={(minimumOrderQty) => setSupplierUnitDraft({ ...supplierUnitDraft, minimumOrderQty })} />
            <Field label="Lead Time (days)" type="number" value={supplierUnitDraft.leadTimeDays} onChange={(leadTimeDays) => setSupplierUnitDraft({ ...supplierUnitDraft, leadTimeDays })} />
            <label className="check"><input type="checkbox" checked={supplierUnitDraft.isDefaultPurchaseUnit} onChange={(event) => setSupplierUnitDraft({ ...supplierUnitDraft, isDefaultPurchaseUnit: event.target.checked })} /> Default purchase unit</label>
          </div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={() => setSupplierUnitDraft(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!supplierUnitDraft?.unitId} onClick={saveCreateSupplierUnit}>Save Purchase Unit</button>
        </div>
      </Modal>

      <Modal open={Boolean(initialPriceDraft)} onClose={() => setInitialPriceDraft(null)} title="Add Initial Price">
        <div className="modal-body">
          {initialPriceDraft && <div className="form-grid">
            <div className="field">
              <SearchableSelect label="Supplier" value={initialPriceDraft.supplierId} onChange={(supplierId) => setInitialPriceDraft({ ...initialPriceDraft, supplierId, unitId: "" })} options={supplierOptions.filter((option) => activeCreateSupplierIds.has(String(option.value)))} placeholder="Search approved suppliers..." emptyMessage="No active approved suppliers." required />
            </div>
            <div className="field">
              <SearchableSelect label="Purchase Unit" value={initialPriceDraft.unitId} onChange={(unitId) => setInitialPriceDraft({ ...initialPriceDraft, unitId })} options={purchaseUnitOptions.filter((option) => activeCreateUnitKeys.has(`${initialPriceDraft.supplierId}:${String(option.value)}`))} placeholder="Search purchase units..." emptyMessage="No active purchase units for this supplier." required />
            </div>
            <Field label="Initial Purchase Price" type="number" value={initialPriceDraft.purchasePrice} onChange={(purchasePrice) => setInitialPriceDraft({ ...initialPriceDraft, purchasePrice })} required />
            <Field label="Currency" value={initialPriceDraft.currencyCode} onChange={(currencyCode) => setInitialPriceDraft({ ...initialPriceDraft, currencyCode: currencyCode.toUpperCase() })} required />
            <Field label="Effective From" value="On product creation" onChange={() => {}} disabled />
          </div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={() => setInitialPriceDraft(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!initialPriceDraft?.supplierId || !initialPriceDraft.unitId || Number(initialPriceDraft.purchasePrice) <= 0} onClick={saveCreateInitialPrice}>Add Initial Price</button>
        </div>
      </Modal>
    </div>
  );
}
