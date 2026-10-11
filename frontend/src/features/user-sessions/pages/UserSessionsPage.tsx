import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { userSessionsApi } from '../api/user-sessionsApi';

export function UserSessionsPage() {
  const queryClient = useQueryClient();
  const sessions = useQuery({ queryKey: ['platform-user-sessions'], queryFn: userSessionsApi.list });
  const revoke = useMutation({
    mutationFn: userSessionsApi.deactivate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-user-sessions'] }),
  });
  return <div>
    <div className="page-head"><div><h1>Tenant user sessions</h1><p>Review and revoke sessions across tenants.</p></div></div>
    <div className="card"><table className="table"><thead><tr><th>Session</th><th>Tenant</th><th>User</th><th>Expires</th><th>Revoked</th><th className="right">Actions</th></tr></thead><tbody>
      {sessions.isLoading ? <tr><td colSpan={6}>Loading...</td></tr> : sessions.isError ? <tr><td colSpan={6}>Unable to load sessions.</td></tr> : (sessions.data ?? []).map((session) => <tr key={session.userSessionId}>
        <td>{session.userSessionId}</td><td>{session.tenantId}</td><td>{session.username ?? session.userId}</td><td>{session.expiresAt ? new Date(session.expiresAt).toLocaleString() : '—'}</td><td>{session.revokedAt ? new Date(session.revokedAt).toLocaleString() : '—'}</td>
        <td className="right">{!session.revokedAt && <button className="btn btn-danger-soft" disabled={revoke.isPending} onClick={() => revoke.mutate(Number(session.userSessionId))}>Revoke</button>}</td>
      </tr>)}</tbody></table></div>
      {revoke.isError && <div className="error-box">Unable to revoke session. Refresh and try again.</div>}
  </div>;
}
