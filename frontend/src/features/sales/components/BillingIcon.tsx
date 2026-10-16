type IconName = 'cart' | 'location' | 'terminal' | 'calendar' | 'session' | 'barcode' | 'tag' | 'items' | 'customer' | 'payment' | 'box' | 'check';

export function BillingIcon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    cart: <><path d="M3 3h2l3 12h10l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    location: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    terminal: <><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8M12 16v5M7 8h10"/></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15h6"/></>,
    session: <><path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4.5 4.5 0 0 1 6 0"/><circle cx="12" cy="20" r="1"/></>,
    barcode: <><path d="M3 4v16M6 4v16M10 4v16M13 4v16M17 4v16M21 4v16"/></>,
    tag: <><path d="m3 12 9 9 9-9V3h-9L3 12Z"/><circle cx="16" cy="8" r="1"/></>,
    items: <><path d="M9 6h12M9 12h12M9 18h12"/><rect x="3" y="5" width="2" height="2"/><rect x="3" y="11" width="2" height="2"/><rect x="3" y="17" width="2" height="2"/></>,
    customer: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  };
  return <svg className={`billing-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
