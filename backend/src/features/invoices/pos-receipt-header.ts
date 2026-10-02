import { EntityManager } from 'typeorm';
import { Location } from '../locations/locations.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';

export async function posReceiptHeader(manager: EntityManager, tenantId: number, locationId: number, staffUserId: number) {
  const [tenant, location, staff] = await Promise.all([
    manager.getRepository(Tenant).findOneByOrFail({ tenantId }),
    manager.getRepository(Location).findOneByOrFail({ tenantId, locationId }),
    manager.getRepository(User).findOneByOrFail({ tenantId, userId: staffUserId }),
  ]);
  const address = [location.addressLine1, location.addressLine2, location.city, location.stateProvince, location.postalCode]
    .map((part) => part?.trim()).filter(Boolean) as string[];
  return {
    companyName: tenant.name,
    locationName: location.name,
    locationCode: location.code.trim().toUpperCase(),
    locationAddress: address,
    locationPhone: location.phone,
    cashierCode: staff.username,
    cashierName: [staff.firstName, staff.lastName].filter(Boolean).join(' ') || staff.username,
    timeZone: tenant.timeZone,
    configurationWarnings: address.length ? [] : ['Location receipt address is missing. Complete the location address in administration.'],
  };
}
