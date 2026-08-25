import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Location } from '../features/locations/locations.entity';
import { Tenant } from '../features/tenants/tenant.entity';

/**
 * Shared company header for transactional documents. Tenant identity is kept
 * separate from the address of the location that owns the transaction.
 */
export async function loadDocumentHeader(source: DataSource | EntityManager, tenantId: number, locationId: number) {
  const [tenant, location] = await Promise.all([
    source.getRepository(Tenant).findOneBy({ tenantId }),
    source.getRepository(Location).findOneBy({ tenantId, locationId }),
  ]);
  if (!tenant || !location) throw new NotFoundException('Document company or location not found.');
  return {
    company: {
      code: tenant.code,
      name: tenant.name,
      legalName: tenant.legalName,
      registrationNumber: tenant.registrationNumber,
      taxRegistrationNumber: tenant.taxRegistrationNumber,
      email: tenant.email,
      phone: tenant.phone,
      website: tenant.website,
      logoUrl: tenant.logoUrl,
    },
    location: {
      locationId: location.locationId,
      code: location.code,
      name: location.name,
      locationType: location.locationType,
      addressLine1: location.addressLine1,
      addressLine2: location.addressLine2,
      city: location.city,
      stateProvince: location.stateProvince,
      postalCode: location.postalCode,
      countryCode: location.countryCode,
      phone: location.phone,
      email: location.email,
    },
  };
}
