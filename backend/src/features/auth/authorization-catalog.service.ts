import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ModuleEntity } from '../modules/modules.entity';
import { Permission } from '../permissions/permissions.entity';
import { Tenant } from '../tenants/tenant.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

const MODULES = [
  ['MASTER_DATA', 'Master Data'], ['PRODUCT', 'Products'], ['SUPPLIER', 'Suppliers'],
  ['LOCATION', 'Locations'], ['PRICING', 'Pricing'], ['USER_MANAGEMENT', 'User Management'],
  ['PURCHASING', 'Purchasing'],
] as const;
const PERMISSIONS = [
  ['MASTER_DATA', 'CATEGORY'], ['MASTER_DATA', 'BRAND'], ['MASTER_DATA', 'UNIT'], ['MASTER_DATA', 'ATTRIBUTE'], ['MASTER_DATA', 'IDENTIFIER_TYPE'], ['MASTER_DATA', 'CUSTOMER'],
  ['PRODUCT', 'PRODUCT'], ['PRODUCT', 'PRODUCT_UNIT'], ['PRODUCT', 'PRODUCT_IDENTIFIER'], ['PRODUCT', 'PRODUCT_ATTRIBUTE'],
  ['SUPPLIER', 'SUPPLIER'], ['SUPPLIER', 'PRODUCT_SUPPLIER'],
  ['LOCATION', 'LOCATION'], ['LOCATION', 'PRODUCT_LOCATION'],
  ['PRICING', 'PRICE_LIST'], ['PRICING', 'PRICE_LIST_ITEM'], ['PRICING', 'PRODUCT_SUPPLIER_PRICE'],
  ['USER_MANAGEMENT', 'USER'], ['USER_MANAGEMENT', 'ROLE'], ['USER_MANAGEMENT', 'ROLE_PERMISSION'], ['USER_MANAGEMENT', 'PERMISSION'],
] as const;

@Injectable()
export class AuthorizationCatalogService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}
  async onModuleInit() {
    const modules = this.dataSource.getRepository(ModuleEntity);
    const permissions = this.dataSource.getRepository(Permission);
    const tenantModules = this.dataSource.getRepository(TenantModule);
    const tenants = await this.dataSource.getRepository(Tenant).find();
    const byCode = new Map<string, ModuleEntity>();
    for (const [code, name] of MODULES) {
      let module = await modules.findOneBy({ code });
      if (!module) module = await modules.save(modules.create({ code, name, isActive: true }));
      byCode.set(code, module);
    }
    for (const [moduleCode, resource] of PERMISSIONS) {
      const module = byCode.get(moduleCode)!;
      for (const action of ['VIEW', 'CREATE', 'UPDATE', 'DEACTIVATE']) {
        const code = `${resource}_${action}`;
        if (!await permissions.findOneBy({ code })) await permissions.save(permissions.create({ moduleId: module.moduleId, code, name: `${resource.replace(/_/g, ' ')} ${action.toLowerCase()}`, isActive: true }));
      }
    }
    const purchasing = byCode.get('PURCHASING')!;
    const purchasingPermissions = ['PURCHASE_ORDER_VIEW','PURCHASE_ORDER_CREATE','PURCHASE_ORDER_UPDATE','PURCHASE_ORDER_APPROVE','PURCHASE_ORDER_CANCEL','GRN_VIEW','GRN_CREATE','GRN_UPDATE','GRN_POST','GRN_CANCEL'];
    for (const code of purchasingPermissions) if (!await permissions.findOneBy({ code })) await permissions.save(permissions.create({ moduleId: purchasing.moduleId, code, name: code.replace(/_/g,' ').toLowerCase(), isActive: true }));
    for (const tenant of tenants) for (const module of byCode.values()) {
      if (module.code === 'PURCHASING') continue;
      if (!await tenantModules.findOneBy({ tenantId: tenant.tenantId, moduleId: module.moduleId })) await tenantModules.save(tenantModules.create({ tenantId: tenant.tenantId, moduleId: module.moduleId, isEnabled: true }));
    }
  }
}
