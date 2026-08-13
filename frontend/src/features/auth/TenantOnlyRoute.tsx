import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function TenantOnlyRoute() {
  const { scope } = useAuth();
  if (scope !== 'TENANT') return <Navigate to="/" replace />;
  return <Outlet />;
}
