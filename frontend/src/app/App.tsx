import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import './app.css';

import { useAuth } from '../features/auth/AuthContext';

const groups = [
  {
    title: 'Overview',
    items: [['Dashboard', '/']],
  },
  {
    title: 'Organization',
    items: [
      ['Tenants', '/tenants'],
      ['Users', '/users'],
      ['Roles', '/roles'],
      ['Permissions', '/permissions'],
    ],
  },
  {
    title: 'Product Master',
    items: [
      ['Products', '/products'],
      ['Categories', '/categories'],
      ['Brands', '/brands'],
      ['Units', '/units'],
      ['Identifiers', '/identifier-types'],
      ['Attributes', '/attributes'],
    ],
  },
  {
    title: 'Supply & Pricing',
    items: [
      ['Suppliers', '/suppliers'],
      ['Product Suppliers', '/product-suppliers'],
      ['Product Costing', '/product-costing'],
      ['Price Lists', '/price-lists'],
    ],
  },
  {
    title: 'Locations',
    items: [
      ['Locations', '/locations'],
      ['Product Locations', '/product-locations'],
    ],
  },
  {
    title: 'System',
    items: [
      ['Modules', '/modules'],
      ['User Roles', '/user-roles'],
      ['Role Permissions', '/role-permissions'],
      ['Sessions', '/user-sessions'],
    ],
  },
] as const;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { platformUser, logout } = useAuth();

  const title =
    groups
      .flatMap((group) => group.items)
      .find((item) => item[1] === location.pathname)?.[0] ??
    'ERP';

  const displayName =
    [platformUser?.firstName, platformUser?.lastName]
      .filter(Boolean)
      .join(' ') ||
    platformUser?.username ||
    'Administrator';

  const avatar = displayName
    .slice(0, 1)
    .toUpperCase();

  function signOut() {
    logout();
    navigate('/login', { replace: true });
  }

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
            <small>Current scope</small>
            <strong>Platform administration</strong>
          </div>
        </div>

        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.title}>
              <div className="nav-group-title">
                {group.title}
              </div>

              {group.items.map(([label, to]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    isActive ? 'nav active' : 'nav'
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
          <span>●</span> Platform session active
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
            <button
              className="icon-btn"
              type="button"
              aria-label="Search"
            >
              ⌕
            </button>

            <div className="profile">
              <span className="avatar user-avatar">
                {avatar}
              </span>

              <div>
                <strong>{displayName}</strong>
                <small>Platform administrator</small>
              </div>

              <button
                className="icon-btn"
                type="button"
                onClick={signOut}
                title="Sign out"
                aria-label="Sign out"
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
