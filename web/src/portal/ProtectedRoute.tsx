import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Role } from './api';

type ProtectedRouteProps = {
  roles?: Role[];
};

export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { account, loading } = useAuth();

  if (loading) {
    return <div className="portal-loading">Loading…</div>;
  }
  if (!account) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(account.role)) {
    const home = account.role === 'ADMIN' ? '/admin' : '/portal';
    return <Navigate to={home} replace />;
  }
  return <Outlet />;
}
