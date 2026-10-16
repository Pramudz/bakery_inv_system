import { useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function BillingHeader({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setTarget(document.getElementById('billing-header-slot')); }, []);
  return target
    ? createPortal(<div className="billing-redesign billing-header-host">{children}</div>, target)
    : <>{children}</>;
}
