import { CrudPage } from '../../../components/ui/CrudPage';
import { userSessionsApi } from '../api/user-sessionsApi';
export function UserSessionsPage(){
  return <CrudPage 
    title="User Sessions" 
    subtitle="Session records for authenticated users." 
    queryKey="user-sessions" 
    api={userSessionsApi} 
    columns={[
      { key: 'id', label: 'ID' }, 
      { key: 'userId', label: 'User' }, 
      { key: 'ipAddress', label: 'IP' }, 
      { key: 'expiresAt', label: 'Expires' }, 
      { key: 'revokedAt', label: 'Revoked' }
    ]} 
    fields={[
      { name: 'userId', label: 'User ID', type: 'number', required: true }, 
      { name: 'sessionTokenHash', label: 'Session token hash', type: 'text', required: true }, 
      { name: 'ipAddress', label: 'IP address', type: 'text', required: false }, 
      { name: 'userAgent', label: 'User agent', type: 'text', required: false }, 
      { name: 'expiresAt', label: 'Expires at', type: 'datetime-local', required: true }
    ]}
  />;
}
