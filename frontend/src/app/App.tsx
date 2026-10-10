import { useState } from "react";
import { readSidebarPreference, saveSidebarPreference } from "./sidebarPreference";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./app.css";
import { useAuth } from "../features/auth/AuthContext";

const platformGroups = [
  { title: "Overview", items: [["Dashboard", "/"]] },
  { title: "Platform", items: [["Tenants", "/tenants"]] },
] as const;

const tenantGroups = [
  {
    title: "Overview",
    items: [
      ["Dashboard", "/"],
      ["My Tenant", "/my-tenant"],
    ],
  },
  {
    title: "Sales",
    items: [
      ["Sales", "/sales"],
      ["Billing", "/billing"],
      ["Quotations", "/quotations"],
      ["Pending Payments", "/pending-payments"],
      ["Refunds", "/refunds"],
      ["Payment Methods", "/payment-methods"],
      ["Card Channels", "/card-channels"],
      ["Register Management", "/pos-register-management"],
    ],
  },
  {
    title: "Organization",
    items: [
      ["Users", "/users"],
      ["Roles", "/roles"],
      ["Permissions", "/permissions"],
    ],
  },
  {
    title: "Product Master",
    items: [
      ["Products", "/products"],
      ["Product Bulk Import", "/product-bulk-import"],
      ["Categories", "/categories"],
      ["Brands", "/brands"],
      ["Units", "/units"],
      ["Identifiers", "/identifier-types"],
      ["Price Lists", "/price-lists"],
      ["Attributes", "/attributes"],
    ],
  },
  {
    title: "Master Data",
    items: [["Bulk Data Import", "/bulk-data-import"]],
  },
  {
    title: "Supply & Pricing",
    items: [["Suppliers", "/suppliers"]],
  },
  {
    title: "Customers",
    items: [["Customers", "/customers"]],
  },
  {
    title: "Purchasing",
    items: [
      ["Purchase Orders", "/purchase-orders"],
      ["Goods Receipts", "/goods-receipts"],
      ["Reverse GRN", "/goods-receipts/reverse"],
    ],
  },
  {
    title: "Inventory",
    items: [
      ["Inventory Adjustments", "/inventory/adjustments"],
      ["Opening Inventory Bulk Import", "/inventory/opening-import"],
      ["Value Adjustments / Conversions", "/inventory/value-adjustments"],
      ["Adjustment Reasons", "/inventory/adjustment-reasons"],
    ],
  },
  {
    title: "Locations",
    items: [["Locations", "/locations"]],
  },
  {
    title: "Reports & Analytics",
    items: [["Reports & Analytics", "/reports-analytics"]],
  },
  {
    title: "Company Details",
    items: [["Company Details", "/company-details"]],
  },
  {
    title: "System",
    items: [
      ["Modules", "/modules"],
      ["User Roles", "/user-roles"],
      ["Role Permissions", "/role-permissions"],
      ["Sessions", "/user-sessions"],
    ],
  },
] as const;

const moduleForPath: Record<string, string> = {
  "/sales": "SALES",
  "/billing": "SALES",
  "/quotations": "SALES",
  "/pending-payments": "SALES",
  "/refunds": "SALES",
  "/payment-methods": "SALES",
  "/card-channels": "SALES",
  "/pos-registers": "SALES",
  "/pos-register-verification": "SALES",
  "/pos-master-closing": "SALES",
  "/pos-register-management": "SALES",
  "/users": "USER_MANAGEMENT",
  "/roles": "USER_MANAGEMENT",
  "/permissions": "USER_MANAGEMENT",
  "/user-roles": "USER_MANAGEMENT",
  "/role-permissions": "USER_MANAGEMENT",
  "/products": "PRODUCT",
  "/product-bulk-import": "PRODUCT",
  "/product-units": "PRODUCT",
  "/product-identifiers": "PRODUCT",
  "/product-attributes": "PRODUCT",
  "/categories": "MASTER_DATA",
  "/brands": "MASTER_DATA",
  "/units": "MASTER_DATA",
  "/identifier-types": "MASTER_DATA",
  "/attributes": "MASTER_DATA",
  "/suppliers": "SUPPLIER",
  "/price-lists": "PRICING",
  "/locations": "LOCATION",
  "/company-details": "LOCATION",
  "/purchase-orders": "PURCHASING",
  "/goods-receipts": "PURCHASING",
  "/goods-receipts/reverse": "PURCHASING",
  "/inventory/adjustments": "INVENTORY",
  "/inventory/opening-import": "INVENTORY",
  "/inventory/value-adjustments": "INVENTORY",
  "/inventory/adjustment-reasons": "INVENTORY",
};

const viewPermissionForPath: Record<string, string> = {
  "/sales": "SALES_INVOICE_VIEW",
  "/billing": "SALES_BILLING",
  "/quotations": "SALES_QUOTATION_VIEW",
  "/pending-payments": "SALES_PAYMENT_COLLECT",
  "/refunds": "SALES_REFUND_VIEW",
  "/payment-methods": "SALES_PAYMENT_METHOD_VIEW",
  "/card-channels": "SALES_PAYMENT_METHOD_VIEW",
  "/pos-registers": "SALES_POS_REGISTER_ADMIN",
  "/pos-register-verification": "SALES_REGISTER_VERIFY",
  "/pos-master-closing": "SALES_REGISTER_CLOSE",
  "/users": "USER_VIEW",
  "/roles": "ROLE_VIEW",
  "/permissions": "PERMISSION_VIEW",
  "/user-roles": "USER_VIEW",
  "/role-permissions": "ROLE_PERMISSION_VIEW",
  "/products": "PRODUCT_VIEW",
  "/product-bulk-import": "PRODUCT_VIEW",
  "/product-units": "PRODUCT_UNIT_VIEW",
  "/product-identifiers": "PRODUCT_IDENTIFIER_VIEW",
  "/product-attributes": "PRODUCT_ATTRIBUTE_VIEW",
  "/categories": "CATEGORY_VIEW",
  "/brands": "BRAND_VIEW",
  "/units": "UNIT_VIEW",
  "/identifier-types": "IDENTIFIER_TYPE_VIEW",
  "/attributes": "ATTRIBUTE_VIEW",
  "/suppliers": "SUPPLIER_VIEW",
  "/price-lists": "PRICE_LIST_VIEW",
  "/locations": "LOCATION_VIEW",
  "/company-details": "LOCATION_VIEW",
  "/purchase-orders": "PURCHASE_ORDER_VIEW",
  "/goods-receipts": "GRN_VIEW",
  "/goods-receipts/reverse": "GRN_REVERSE",
  "/inventory/adjustments": "INVENTORY_ADJUSTMENT_VIEW",
  "/inventory/opening-import": "INVENTORY_ADJUSTMENT_VIEW",
  "/inventory/value-adjustments": "INVENTORY_VALUE_ADJUSTMENT_VIEW",
  "/inventory/adjustment-reasons": "INVENTORY_ADJUSTMENT_VIEW",
};

const viewAnyPermissionForPath: Record<string, string[]> = {
  "/bulk-data-import": ["CATEGORY_VIEW", "BRAND_VIEW", "UNIT_VIEW", "SUPPLIER_VIEW", "PRICE_LIST_VIEW", "LOCATION_VIEW"],
  "/reports-analytics": [
    "SALES_INVOICE_VIEW",
    "INVENTORY_ADJUSTMENT_VIEW",
    "PURCHASE_ORDER_VIEW",
    "GRN_VIEW",
    "SALES_REFUND_VIEW",
    "SALES_REGISTER_CLOSE",
  ],
  "/pos-register-management": [
    "SALES_BILLING",
    "SALES_POS_REGISTER_ADMIN",
    "SALES_REGISTER_OPEN",
    "SALES_REGISTER_CLOSE",
    "SALES_REGISTER_VERIFY",
    "SALES_REGISTER_PAYOUT",
  ],
};

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarPreference());
  const toggleSidebar = () => {
    const collapsed = !sidebarCollapsed;
    setSidebarCollapsed(collapsed);
    saveSidebarPreference(undefined, collapsed);
  };
  const location = useLocation();
  const navigate = useNavigate();
  const {
    scope,
    platformUser,
    tenant,
    tenantUser,
    roles,
    accessScope,
    assignedLocations,
    modules,
    permissions,
    currentLocationId,
    setCurrentLocation,
    logout,
  } = useAuth();
  const baseGroups = scope === "TENANT" ? tenantGroups : platformGroups;
  const groups = baseGroups.map((group) => ({
    ...group,
    items:
      scope === "TENANT"
        ? group.items.filter(([, path]) => {
            const moduleAllowed =
              !moduleForPath[path] ||
              modules.some((module) => module.code === moduleForPath[path]);
            const permission = viewPermissionForPath[path];
            const anyPermissions = viewAnyPermissionForPath[path];
            return (
              moduleAllowed &&
              (!permission || permissions.includes(permission)) &&
              (!anyPermissions || anyPermissions.some((code) => permissions.includes(code)))
            );
          })
        : group.items,
  }));
  const title =
    (location.pathname.startsWith("/inventory/value-adjustments/")
      ? "Value Adjustments / Conversions"
      : location.pathname.startsWith("/inventory/adjustments/")
      ? "Inventory Adjustments"
      : location.pathname.startsWith("/goods-receipts/")
      ? "Goods Receipts"
      : location.pathname.startsWith("/purchase-orders/")
      ? "Purchase Orders"
      : location.pathname.startsWith("/reports-analytics")
      ? "Reports & Analytics"
      : location.pathname.startsWith("/company-details")
      ? "Company Details"
      : (
          groups as ReadonlyArray<{
            title: string;
            items: ReadonlyArray<readonly [string, string]>;
          }>
        )
          .flatMap((g) => g.items)
          .find((x) => x[1] === location.pathname)?.[0]) ?? "ERP";
  const displayName =
    scope === "TENANT"
      ? [tenantUser?.firstName, tenantUser?.lastName]
          .filter(Boolean)
          .join(" ") ||
        tenantUser?.username ||
        "User"
      : [platformUser?.firstName, platformUser?.lastName]
          .filter(Boolean)
          .join(" ") ||
        platformUser?.username ||
        "Administrator";
  const roleName =
    scope === "TENANT"
      ? (roles[0]?.name ?? "Tenant user")
      : "Platform administrator";
  const contextName =
    scope === "TENANT"
      ? `${tenant?.tenantCode ?? ""} · ${tenant?.tenantName ?? "Tenant"}`
      : "Platform administration";
  const signOut = () => {
    logout();
    navigate(scope === "TENANT" ? "/tenant-login" : "/login", {
      replace: true,
    });
  };

  return (
    <div className={`shell${sidebarCollapsed ? ' shell-sidebar-collapsed' : ''}${location.pathname === '/goods-receipts/reverse' ? ' shell-grn-reversal' : ''}`}>
      <aside id="app-sidebar" className="sidebar" aria-label="Main navigation" aria-hidden={sidebarCollapsed} inert={sidebarCollapsed}>
        <div className="sidebar-inner">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <b>
              ERP<span>Core</span>
            </b>
            <small>Enterprise Resource Platform</small>
          </div>
        </div>
        <div className="tenant-pill">
          <span className="tenant-pulse" />
          <div>
            <small>
              {scope === "TENANT" ? "Current tenant" : "Current scope"}
            </small>
            <strong>{contextName}</strong>
            {scope === "TENANT" && accessScope === "LOCATION" ? (
              <select
                className="location-context"
                value={currentLocationId ?? ""}
                onChange={(e) => setCurrentLocation(e.target.value)}
              >
                {assignedLocations.map((item) => (
                  <option key={item.locationId} value={item.locationId}>
                    {item.name}
                  </option>
                ))}
              </select>
            ) : scope === "TENANT" ? (
              <small>Tenant-wide access</small>
            ) : null}
          </div>
        </div>
        <nav>
          {groups.map((g) => (
            <div className="nav-group" key={g.title}>
              <div className="nav-group-title">{g.title}</div>
              {g.items.map(([label, to]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  className={({ isActive }) =>
                    isActive && !(to === "/goods-receipts" && location.pathname === "/goods-receipts/reverse") ? "nav active" : "nav"
                  }
                >
                  <span className="nav-dot" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>●</span>{" "}
          {scope === "TENANT"
            ? "Tenant session active"
            : "Platform session active"}
        </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar-navigation">
            <button
              className="sidebar-toggle"
              type="button"
              onClick={toggleSidebar}
              aria-controls="app-sidebar"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Show sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Show sidebar" : "Collapse sidebar"}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={sidebarCollapsed ? "M7 4l6 6-6 6" : "M13 4l-6 6 6 6"} />
              </svg>
            </button>
          <div className="crumb">
            <span>ERP Core</span>
            <b>/</b>
            <strong>{title}</strong>
          </div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" type="button">
              ⌕
            </button>
            <div className="profile">
              <span className="avatar user-avatar">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{displayName}</strong>
                <small>{roleName}</small>
              </div>
              <button
                className="icon-btn"
                type="button"
                onClick={signOut}
                title="Sign out"
              >
                ↪
              </button>
            </div>
          </div>
        </header>
        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}
