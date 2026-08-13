import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type TenantContextValue = {
  tenantId:number|null;
  setTenantId:(id:number|null)=>void;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({children}:{children:ReactNode}) {
  const [tenantId,setTenantId]=useState<number|null>(null);
  return <TenantContext.Provider value={{tenantId,setTenantId}}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const value=useContext(TenantContext);
  if(!value) throw new Error('useTenant must be used inside TenantProvider');
  return value;
}
