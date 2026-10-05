type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'erp.sidebar.collapsed';

export function readSidebarPreference(storage?: PreferenceStorage): boolean {
  try { return (storage ?? window.localStorage).getItem(KEY) === 'true'; }
  catch { return false; }
}

export function saveSidebarPreference(storage: PreferenceStorage | undefined, collapsed: boolean): void {
  try { (storage ?? window.localStorage).setItem(KEY, String(collapsed)); }
  catch { /* Navigation remains usable when browser storage is unavailable. */ }
}
