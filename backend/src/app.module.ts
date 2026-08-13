import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantsModule } from './features/tenants/tenants.module';
import { UsersModule } from './features/users/users.module';
import { CategoryModule } from './features/categories/categories.module';
import { SupplierModule } from './features/suppliers/suppliers.module';
import { LocationModule } from './features/locations/locations.module';
import { UnitOfMeasureModule } from './features/units/units.module';
import { ProductModule } from './features/products/products.module';
import { ProductUnitModule } from './features/product-units/product-units.module';
import { ProductSupplierModule } from './features/product-suppliers/product-suppliers.module';

import { BrandModule } from './features/brands/brands.module';
import { IdentifierTypeModule } from './features/identifier-types/identifier-types.module';
import { ProductIdentifierModule } from './features/product-identifiers/product-identifiers.module';
import { ProductLocationModule } from './features/product-locations/product-locations.module';
import { AttributeModule } from './features/attributes/attributes.module';
import { ProductAttributesModule } from './features/product-attributes/product-attributes.module';
import { PriceListModule } from './features/price-lists/price-lists.module';
import { PriceListItemModule } from './features/price-list-items/price-list-items.module';
import { ModuleEntityModule } from './features/modules/modules.module';
import { RoleModule } from './features/roles/roles.module';
import { PermissionModule } from './features/permissions/permissions.module';
import { UserRoleModule } from './features/user-roles/user-roles.module';
import { RolePermissionModule } from './features/role-permissions/role-permissions.module';
import { UserSessionModule } from './features/user-sessions/user-sessions.module';
import { ProductSupplierPricesModule } from './features/product-supplier-prices/product-supplier-prices.module';
import { PlatformUsersModule } from './features/platform-users/platform-users.module';
import { AuthModule } from './features/auth/auth.module';
import { PlatformSessionsModule } from './features/platform-sessions/platform-sessions.module';
import { SecurityModule } from './features/auth/security.module';
import { UserLocationModule } from './features/user-locations/user-locations.module';
import { TenantModulesModule } from './features/tenant-modules/tenant-modules.module';
import { PurchasingModule } from './features/purchasing/purchasing.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<string>('DB_PORT', '3306')),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize:
          config.get<string>('DB_SYNCHRONIZE') === 'true',
      }),
    }),

    PlatformUsersModule,
    PlatformSessionsModule,
    SecurityModule,
    UserLocationModule,
    TenantModulesModule,
    PurchasingModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    CategoryModule,
    SupplierModule,
    LocationModule,
    UnitOfMeasureModule,
    ProductModule,
    ProductUnitModule,
    ProductSupplierModule,
    ProductSupplierPricesModule,
    BrandModule,
    IdentifierTypeModule,
    ProductIdentifierModule,
    ProductLocationModule,
    AttributeModule,
    ProductAttributesModule,
    PriceListModule,
    PriceListItemModule,
    ModuleEntityModule,
    RoleModule,
    PermissionModule,
    UserRoleModule,
    RolePermissionModule,
    UserSessionModule,
  ],
})
export class AppModule {}
