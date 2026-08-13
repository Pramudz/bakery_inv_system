import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import './app.css';
import { useAuth } from '../features/auth/AuthContext';

const platformGroups = [
  { title:'Overview', items:[['Dashboard','/']] },
  { title:'Platform', items:[['Tenants','/tenants']] },
] as const;

const tenantGroups = [
  { title:'Overview', items:[['Dashboard','/'],['My Tenant','/my-tenant']] },
  { title:'Organization', items:[['Users','/users'],['Roles','/roles'],['Permissions','/permissions']] },
  { title:'Product Master', items:[['Products','/products'],['Categories','/categories'],['Brands','/brands'],['Units','/units'],['Identifiers','/identifier-types'],['Attributes','/attributes']] },
  { title:'Supply & Pricing', items:[['Suppliers','/suppliers'],['Product Suppliers','/product-suppliers'],['Product Costing','/product-costing'],['Price Lists','/price-lists']] },
  { title:'Locations', items:[['Locations','/locations'],['Product Locations','/product-locations']] },
  { title:'System', items:[['Modules','/modules'],['User Roles','/user-roles'],['Role Permissions','/role-permissions'],['Sessions','/user-sessions']] },
] as const;

export default function App(){
  const location=useLocation();
  const navigate=useNavigate();
  const {scope,platformUser,tenant,tenantUser,roles,logout}=useAuth();
  const groups = scope === 'TENANT' ? tenantGroups : platformGroups;
  const title=groups.flatMap(g=>g.items).find(x=>x[1]===location.pathname)?.[0] ?? 'ERP';
  const displayName=scope==='TENANT'
    ? ([tenantUser?.firstName,tenantUser?.lastName].filter(Boolean).join(' ') || tenantUser?.username || 'User')
    : ([platformUser?.firstName,platformUser?.lastName].filter(Boolean).join(' ') || platformUser?.username || 'Administrator');
  const roleName=scope==='TENANT' ? (roles[0]?.name ?? 'Tenant user') : 'Platform administrator';
  const contextName=scope==='TENANT'
    ? `${tenant?.tenantCode ?? ''} · ${tenant?.tenantName ?? 'Tenant'}`
    : 'Platform administration';
  const signOut=()=>{logout();navigate(scope==='TENANT'?'/tenant-login':'/login',{replace:true});};

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">E</div><div><b>ERP<span>Core</span></b><small>Enterprise Resource Platform</small></div></div>
      <div className="tenant-pill"><span className="tenant-pulse"/><div><small>{scope==='TENANT'?'Current tenant':'Current scope'}</small><strong>{contextName}</strong></div></div>
      <nav>{groups.map(g=><div className="nav-group" key={g.title}><div className="nav-group-title">{g.title}</div>{g.items.map(([label,to])=><NavLink key={to} to={to} end={to==='/' } className={({isActive})=>isActive?'nav active':'nav'}><span className="nav-dot"/>{label}</NavLink>)}</div>)}</nav>
      <div className="sidebar-foot"><span>●</span> {scope==='TENANT'?'Tenant session active':'Platform session active'}</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb"><span>ERP Core</span><b>/</b><strong>{title}</strong></div><div className="top-actions"><button className="icon-btn" type="button">⌕</button><div className="profile"><span className="avatar user-avatar">{displayName.slice(0,1).toUpperCase()}</span><div><strong>{displayName}</strong><small>{roleName}</small></div><button className="icon-btn" type="button" onClick={signOut} title="Sign out">↪</button></div></div></header>
      <section className="content"><Outlet/></section>
    </main>
  </div>;
}
