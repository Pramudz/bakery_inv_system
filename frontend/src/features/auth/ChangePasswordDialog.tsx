import { startTransition, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { changePassword } from './authApi';
import { AUTH_UNAUTHORIZED_EVENT } from './auth.types';
import { validatePasswordChange } from './passwordChange';
import type { PasswordChange } from './passwordChange';
import './account-security.css';

export function ChangePasswordDialog({ accountName, onClose }: { accountName: string; onClose: () => void }) {
  const { scope } = useAuth();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<PasswordChange>({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !scope) return;
    const validation = validatePasswordChange(values);
    setError(validation);
    if (validation) return;
    setPending(true);
    try {
      await changePassword(scope, values);
      // The server has revoked all sessions. Clear the existing local auth state.
      startTransition(() => {
        navigate(scope === 'TENANT' ? '/tenant-login' : '/login', { replace: true, state: { passwordChanged: true } });
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change your password. Please try again.');
      setPending(false);
    }
  }

  const fields = [
    { key: 'currentPassword', label: 'Current password', autoComplete: 'current-password' },
    { key: 'newPassword', label: 'New password', autoComplete: 'new-password' },
    { key: 'confirmPassword', label: 'Confirm new password', autoComplete: 'new-password' },
  ] as const;

  return (
    <dialog ref={dialog} className="password-dialog" aria-labelledby="change-password-title"
      aria-describedby="change-password-description" onCancel={event => { event.preventDefault(); if (!pending) onClose(); }}>
      <div className="password-dialog-header">
        <div className="security-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>
        </div>
        <button type="button" className="icon-btn" aria-label="Close change password" disabled={pending} onClick={onClose}>×</button>
      </div>
      <div className="eyebrow">ACCOUNT SECURITY</div>
      <h2 id="change-password-title">Change password</h2>
      <p id="change-password-description" className="password-description">Update the password for your {scope === 'TENANT' ? 'tenant' : 'platform'} account.</p>
      <div className="password-account"><span>Signed in as</span><strong>{accountName}</strong></div>
      <form onSubmit={submit} aria-busy={pending}>
        <fieldset disabled={pending}>
          {fields.map(({ key, label, autoComplete }, index) => (
            <div className="field" key={key}>
              <label htmlFor={`change-${key}`}>{label}</label>
              <div className="login-password-wrap">
                <input id={`change-${key}`} className="input" type={visible[key] ? 'text' : 'password'}
                  autoComplete={autoComplete} autoFocus={index === 0} required
                  maxLength={key === 'currentPassword' ? 100 : 72}
                  value={values[key]} onChange={event => { setValues(current => ({ ...current, [key]: event.target.value })); setError(''); }}
                  aria-describedby={key === 'newPassword' ? 'password-requirements' : undefined}/>
                <button type="button" className="login-password-toggle" aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                  aria-pressed={!!visible[key]} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))}>
                  {visible[key] ? 'Hide' : 'Show'}
                </button>
              </div>
              {key === 'newPassword' && <small id="password-requirements">At least 12 characters, including uppercase, lowercase, a number, and a symbol.</small>}
            </div>
          ))}
        </fieldset>
        <div className="password-session-note">After changing your password, you’ll be signed out on all devices. Sign in again with your new password.</div>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="password-dialog-actions">
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Changing password…' : 'Change Password'}</button>
        </div>
      </form>
    </dialog>
  );
}
