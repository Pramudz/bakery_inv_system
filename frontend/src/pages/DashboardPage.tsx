import { useAuth } from '../features/auth/AuthContext';

export function DashboardPage() {
  const { scope, tenant } = useAuth();
  const isTenant = scope === 'TENANT';

  return <div>
    <div className="page-head">
      <div>
        <div className="eyebrow">ERP CORE</div>
        <h1>{isTenant ? 'Tenant Dashboard' : 'Platform Dashboard'}</h1>
        <p>
          {isTenant
            ? `Workspace for ${tenant?.tenantName ?? 'your business'} master data and ERP setup.`
            : 'Platform workspace for tenant administration and ERP environment management.'}
        </p>
      </div>
    </div>

    <div className="stats-row">
      <div className="stat-card">
        <span>{isTenant ? 'Tenant' : 'Platform scope'}</span>
        <strong>{isTenant ? (tenant?.tenantCode ?? 'Active') : 'Active'}</strong>
      </div>
      <div className="stat-card">
        <span>{isTenant ? 'Master data' : 'Tenant management'}</span>
        <strong>Ready</strong>
      </div>
      <div className="stat-card">
        <span>System status</span>
        <strong>Online</strong>
      </div>
    </div>

    <div className="card">
      <div style={{padding:24}}>
        <h3 style={{margin:'0 0 6px'}}>
          {isTenant ? 'ERP setup sequence' : 'Platform sequence'}
        </h3>
        <p style={{margin:0,color:'#8792a4',fontSize:12}}>
          {isTenant
            ? 'My Tenant → Users & Roles → Product Master → Suppliers & Costing → Locations → Pricing'
            : 'Tenants → Tenant bootstrap → Tenant administration'}
        </p>
      </div>
    </div>
  </div>;
}
