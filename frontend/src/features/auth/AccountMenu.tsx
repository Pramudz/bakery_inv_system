import { useEffect, useRef, useState } from 'react';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import './account-security.css';

export function AccountMenu({ displayName, roleName, onSignOut }: { displayName: string; roleName: string; onSignOut: () => Promise<void> }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current?.open) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, []);
  return <>
    <details className="account-menu" ref={menu}>
      <summary className="profile account-menu-trigger" aria-label={`Account options for ${displayName}`}>
        <span className="avatar user-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
        <div><strong>{displayName}</strong><small>{roleName}</small></div>
        <span className="account-menu-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="account-menu-panel">
        <div className="account-menu-heading">My Account</div>
        <button type="button" onClick={() => { if (menu.current) menu.current.open = false; setChangingPassword(true); }}>Change Password</button>
        <button type="button" onClick={() => { if (menu.current) menu.current.open = false; void onSignOut(); }}>Sign out</button>
      </div>
    </details>
    {changingPassword && <ChangePasswordDialog accountName={displayName} onClose={() => { setChangingPassword(false); menu.current?.querySelector('summary')?.focus(); }} />}
  </>;
}
