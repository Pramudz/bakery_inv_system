import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function PlatformOnlyRoute() {
  const { scope } = useAuth();
  if (scope !== 'PLATFORM') return <Navigate to="/" replace />;
  return <Outlet />;
}
