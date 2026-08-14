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
      ["Categories", "/categories"],
      ["Brands", "/brands"],
      ["Units", "/units"],
      ["Identifiers", "/identifier-types"],
      ["Attributes", "/attributes"],
    ],
  },
  {
    title: "Supply & Pricing",
    items: [
      ["Suppliers", "/suppliers"],
      ["Product Suppliers", "/product-suppliers"],
      ["Product Costing", "/product-costing"],
      ["Price Lists", "/price-lists"],
    ],
  },
  {
    title: "Purchasing",
    items: [
      ["Purchase Orders", "/purchase-orders"],
      ["Goods Receipts", "/goods-receipts"],
    ],
  },
  {
    title: "Locations",
    items: [
      ["Locations", "/locations"],
      ["Product Locations", "/product-locations"],
    ],
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
  "/users": "USER_MANAGEMENT",
  "/roles": "USER_MANAGEMENT",
  "/permissions": "USER_MANAGEMENT",
  "/user-roles": "USER_MANAGEMENT",
  "/role-permissions": "USER_MANAGEMENT",
  "/products": "PRODUCT",
  "/product-units": "PRODUCT",
  "/product-identifiers": "PRODUCT",
  "/product-attributes": "PRODUCT",
  "/categories": "MASTER_DATA",
  "/brands": "MASTER_DATA",
  "/units": "MASTER_DATA",
  "/identifier-types": "MASTER_DATA",
  "/attributes": "MASTER_DATA",
  "/suppliers": "SUPPLIER",
  "/product-suppliers": "SUPPLIER",
  "/product-costing": "PRICING",
  "/price-lists": "PRICING",
  "/locations": "LOCATION",
  "/product-locations": "LOCATION",
  "/purchase-orders": "PURCHASING",
  "/goods-receipts": "PURCHASING",
};

const viewPermissionForPath: Record<string, string> = {
  "/users": "USER_VIEW",
  "/roles": "ROLE_VIEW",
  "/permissions": "PERMISSION_VIEW",
  "/user-roles": "USER_VIEW",
  "/role-permissions": "ROLE_PERMISSION_VIEW",
  "/products": "PRODUCT_VIEW",
  "/product-units": "PRODUCT_UNIT_VIEW",
  "/product-identifiers": "PRODUCT_IDENTIFIER_VIEW",
  "/product-attributes": "PRODUCT_ATTRIBUTE_VIEW",
  "/categories": "CATEGORY_VIEW",
  "/brands": "BRAND_VIEW",
  "/units": "UNIT_VIEW",
  "/identifier-types": "IDENTIFIER_TYPE_VIEW",
  "/attributes": "ATTRIBUTE_VIEW",
  "/suppliers": "SUPPLIER_VIEW",
  "/product-suppliers": "PRODUCT_SUPPLIER_VIEW",
  "/product-costing": "PRODUCT_SUPPLIER_PRICE_VIEW",
  "/price-lists": "PRICE_LIST_VIEW",
  "/locations": "LOCATION_VIEW",
  "/product-locations": "PRODUCT_LOCATION_VIEW",
  "/purchase-orders": "PURCHASE_ORDER_VIEW",
  "/goods-receipts": "GRN_VIEW",
};

export default function App() {
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
            return (
              moduleAllowed && (!permission || permissions.includes(permission))
            );
          })
        : group.items,
  }));
  const title =
    (
      groups as ReadonlyArray<{
        title: string;
        items: ReadonlyArray<readonly [string, string]>;
      }>
    )
      .flatMap((g) => g.items)
      .find((x) => x[1] === location.pathname)?.[0] ?? "ERP";
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
    <div className="shell">
      <aside className="sidebar">
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
                    isActive ? "nav active" : "nav"
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
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            <span>ERP Core</span>
            <b>/</b>
            <strong>{title}</strong>
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
