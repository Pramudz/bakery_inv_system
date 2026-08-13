import type { ReactNode } from 'react';

type Props = { open: boolean; title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean };
export function Modal({ open, title, subtitle, children, onClose, wide }: Props) {
  if (!open) return null;
  return <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={wide ? 'modal modal-wide' : 'modal'}>
      <div className="modal-head">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>
      {children}
    </div>
  </div>;
}
