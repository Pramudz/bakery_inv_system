import { useQuery } from '@tanstack/react-query';
import { tenantProfileApi } from '../api/tenantProfileApi';

export function TenantProfilePage() {
  const q = useQuery({
    queryKey: ['tenant-profile'],
    queryFn: tenantProfileApi.get,
  });

  if (q.isLoading) return <div className="empty">Loading tenant details...</div>;
  if (q.error) return <div className="empty error-text">Unable to load your tenant details.</div>;

  const tenant = q.data;
  if (!tenant) return <div className="empty">Tenant details not found.</div>;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">MY ORGANIZATION</div>
          <h1>{tenant.tenantName}</h1>
          <p>Details for the business associated with your login.</p>
        </div>
        <span className={tenant.tenantIsActive ? 'status status-on' : 'status status-off'}>
          <i /> {tenant.tenantIsActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="card">
        <div className="form-grid">
          <div className="stat-card">
            <span>Tenant code</span>
            <strong>{tenant.tenantCode}</strong>
          </div>
          <div className="stat-card">
            <span>Tenant ID</span>
            <strong>{tenant.tenantId}</strong>
          </div>
          <div className="stat-card">
            <span>Tenant name</span>
            <strong>{tenant.tenantName}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
