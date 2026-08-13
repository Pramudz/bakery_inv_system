import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';

import { Tenant } from './tenant.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { UserRole } from '../user-roles/user-roles.entity';
import { ModuleEntity } from '../modules/modules.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const DEFAULT_ADMIN_USERNAME = 'Admin';
const DEFAULT_ADMIN_PASSWORD = 'tenantadmin@123';
const DEFAULT_ADMIN_ROLE_CODE = 'TENANT_ADMIN';
const DEFAULT_ADMIN_ROLE_NAME = 'Administrator';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly repo: Repository<Tenant>,
    private readonly dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({ order: { tenantId: 'ASC' } });
  }

  async findOne(id: number) {
    const row = await this.repo.findOneBy({ tenantId: id });
    if (!row) throw new NotFoundException('Tenant not found');
    return row;
  }

  /**
   * Creates the tenant and its initial administrator in one transaction.
   * Password-change enforcement is intentionally not enabled yet.
   */
  async create(dto: CreateTenantDto) {
    const existing = await this.repo.findOneBy({
      tenantCode: dto.tenantCode,
    });

    if (existing) {
      throw new ConflictException('Tenant code already exists');
    }

    return this.dataSource.transaction(async (manager) => {
      const tenantRepository = manager.getRepository(Tenant);
      const userRepository = manager.getRepository(User);
      const roleRepository = manager.getRepository(Role);
      const userRoleRepository = manager.getRepository(UserRole);
      const moduleRepository = manager.getRepository(ModuleEntity);
      const tenantModuleRepository = manager.getRepository(TenantModule);

      // Re-check inside the transaction.
      const existingInsideTransaction =
        await tenantRepository.findOneBy({
          tenantCode: dto.tenantCode,
        });

      if (existingInsideTransaction) {
        throw new ConflictException('Tenant code already exists');
      }

      // 1. Tenant
      const tenant = tenantRepository.create({
        tenantCode: dto.tenantCode.trim(),
        tenantName: dto.tenantName.trim(),
        tenantIsActive: true,
      });

      const savedTenant = await tenantRepository.save(tenant);
      const defaultModules = [
        ['MASTER_DATA', 'Master Data'], ['PRODUCT', 'Products'], ['SUPPLIER', 'Suppliers'],
        ['LOCATION', 'Locations'], ['PRICING', 'Pricing'], ['USER_MANAGEMENT', 'User Management'],
      ];
      for (const [code, name] of defaultModules) {
        let module = await moduleRepository.findOneBy({ code });
        if (!module) module = await moduleRepository.save(moduleRepository.create({ code, name, isActive: true }));
        await tenantModuleRepository.save(tenantModuleRepository.create({ tenantId: savedTenant.tenantId, moduleId: module.moduleId, isEnabled: true }));
      }

      // 2. First system role
      const adminRole = roleRepository.create({
        tenantId: savedTenant.tenantId,
        code: DEFAULT_ADMIN_ROLE_CODE,
        name: DEFAULT_ADMIN_ROLE_NAME,
        description:
          'Default administrator role created during tenant bootstrap.',
        accessScope: 'TENANT',
        isSystemRole: true,
        isActive: true,
      });

      const savedRole = await roleRepository.save(adminRole);

      // 3. First tenant user
      const passwordHash = await bcrypt.hash(
        DEFAULT_ADMIN_PASSWORD,
        12,
      );

      const adminUser = userRepository.create({
        tenantId: savedTenant.tenantId,
        username: DEFAULT_ADMIN_USERNAME,
        email: null,
        passwordHash,
        firstName: 'Tenant',
        lastName: 'Administrator',
        mobile: null,
        isActive: true,
        lastLoginAt: null,
      });

      const savedUser = await userRepository.save(adminUser);

      // 4. Assign Admin -> TENANT_ADMIN
      const userRole = userRoleRepository.create({
        userId: savedUser.userId,
        roleId: savedRole.roleId,
        assignedAt: new Date(),
      });

      await userRoleRepository.save(userRole);

      return {
        message: 'Tenant created successfully.',
        tenant: {
          tenantId: savedTenant.tenantId,
          tenantCode: savedTenant.tenantCode,
          tenantName: savedTenant.tenantName,
          tenantIsActive: savedTenant.tenantIsActive,
          createdAt: savedTenant.createdAt,
          updatedAt: savedTenant.updatedAt,
        },
        bootstrap: {
          role: {
            roleId: savedRole.roleId,
            code: savedRole.code,
            name: savedRole.name,
          },
          user: {
            userId: savedUser.userId,
            username: savedUser.username,
            firstName: savedUser.firstName,
            lastName: savedUser.lastName,
            isActive: savedUser.isActive,
          },
          username: DEFAULT_ADMIN_USERNAME,
          defaultPassword: DEFAULT_ADMIN_PASSWORD,
        },
      };
    });
  }

  async update(id: number, dto: UpdateTenantDto) {
    await this.findOne(id);

    if (dto.tenantCode) {
      const same = await this.repo.findOneBy({
        tenantCode: dto.tenantCode,
      });

      if (same && same.tenantId !== id) {
        throw new ConflictException('Tenant code already exists');
      }
    }

    await this.repo.update(id, dto);
    return this.findOne(id);
  }

  async deactivate(id: number) {
    await this.findOne(id);
    await this.repo.update(id, { tenantIsActive: false });
    return this.findOne(id);
  }

  async activate(id: number) {
    await this.findOne(id);
    await this.repo.update(id, { tenantIsActive: true });
    return this.findOne(id);
  }
}
