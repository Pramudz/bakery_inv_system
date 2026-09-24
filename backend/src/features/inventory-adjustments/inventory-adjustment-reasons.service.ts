import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { Tenant } from '../tenants/tenant.entity';
import { CreateInventoryAdjustmentReasonDto, SetInventoryAdjustmentReasonActiveDto, UpdateInventoryAdjustmentReasonDto } from './dto/inventory-adjustment-reason.dto';
import { InventoryAdjustmentReason } from './inventory-adjustment-reason.entity';

export const SYSTEM_ADJUSTMENT_REASONS = [
  ['EXPIRY', 'Expiry', 'OUT', 'CURRENT_WAVG'],
  ['DAMAGE', 'Damage', 'OUT', 'CURRENT_WAVG'],
  ['WRITE_OFF', 'Write Off', 'OUT', 'CURRENT_WAVG'],
  ['STOCK_LOSS', 'Stock Loss', 'OUT', 'CURRENT_WAVG'],
  ['INVENTORY_CORRECTION', 'Inventory Correction', 'BOTH', 'CURRENT_WAVG'],
  ['CYCLE_RECONCILIATION', 'Cycle Reconciliation', 'BOTH', 'CURRENT_WAVG'],
  ['OPENING_INVENTORY', 'Opening Inventory', 'IN', 'MANUAL_REQUIRED'],
  ['OTHER', 'Other', 'BOTH', 'CURRENT_WAVG'],
] as const;

export async function ensureSystemAdjustmentReasons(manager: EntityManager, tenantId: number) {
  const repository = manager.getRepository(InventoryAdjustmentReason);
  for (const [code, name, allowedDirection, costingPolicy] of SYSTEM_ADJUSTMENT_REASONS) {
    if (!await repository.findOneBy({ tenantId, code })) {
      await repository.save(repository.create({ tenantId, code, name, allowedDirection, costingPolicy, reasonCategory: null, requiresRemarks: code === 'OTHER', requiresApproval: false, isSystemReason: true, isActive: true }));
    }
  }
}

@Injectable()
export class InventoryAdjustmentReasonsService implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    if (!this.dataSource.isInitialized) return;
    const tenants = await this.dataSource.getRepository(Tenant).find({ select: { tenantId: true } });
    for (const tenant of tenants) await this.ensureSystemReasons(this.dataSource.manager, Number(tenant.tenantId));
  }

  async ensureSystemReasons(manager: EntityManager, tenantId: number) {
    await ensureSystemAdjustmentReasons(manager, tenantId);
  }

  async list(user: TenantPrincipal, direction = '', active = '', options: { page?: string; limit?: string; search?: string; system?: string } = {}) {
    await this.ensureSystemReasons(this.dataSource.manager, user.tenantId);
    const paginated = options.page !== undefined && options.page !== '' || options.limit !== undefined && options.limit !== '' || Boolean(options.search?.trim()) || options.system === 'true' || options.system === 'false';
    const query = this.dataSource.getRepository(InventoryAdjustmentReason).createQueryBuilder('reason')
      .where('reason.tenantId = :tenantId', { tenantId: user.tenantId });
    const normalizedDirection = direction.toUpperCase();
    if (['IN', 'OUT'].includes(normalizedDirection)) {
      if (paginated) query.andWhere('reason.allowedDirection = :direction', { direction: normalizedDirection });
      else query.andWhere('reason.allowedDirection IN (:...directions)', { directions: [normalizedDirection, 'BOTH'] });
    }
    if (normalizedDirection === 'BOTH') query.andWhere('reason.allowedDirection = :direction', { direction: 'BOTH' });
    if (active === 'true' || active === 'false') query.andWhere('reason.isActive = :active', { active: active === 'true' });
    if (options.search?.trim()) query.andWhere('(LOWER(reason.code) LIKE :search OR LOWER(reason.name) LIKE :search OR LOWER(COALESCE(reason.reasonCategory, \'\')) LIKE :search)', { search: `%${options.search.trim().toLowerCase()}%` });
    if (options.system === 'true' || options.system === 'false') query.andWhere('reason.isSystemReason = :system', { system: options.system === 'true' });
    query.orderBy('reason.isSystemReason', 'DESC').addOrderBy('reason.name', 'ASC');
    if (!paginated) return query.getMany();
    const parsedPage = Number(options.page || 1);
    const parsedLimit = Number(options.limit || 20);
    const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = [20, 50, 100].includes(parsedLimit) ? parsedLimit : 20;
    const [items, total] = await query.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async create(dto: CreateInventoryAdjustmentReasonDto, user: TenantPrincipal) {
    const repository = this.dataSource.getRepository(InventoryAdjustmentReason);
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Reason name is required.');
    this.assertCostingDirection(dto.allowedDirection, dto.costingPolicy);
    try {
      return await repository.save(repository.create({ ...dto, code, name, tenantId: user.tenantId, reasonCategory: dto.reasonCategory?.trim() || null, requiresRemarks: dto.requiresRemarks ?? false, requiresApproval: dto.requiresApproval ?? false, isSystemReason: false, isActive: true }));
    } catch (error) {
      if (error instanceof QueryFailedError) throw new ConflictException('Reason code already exists for this tenant.');
      throw error;
    }
  }

  async update(id: number, dto: UpdateInventoryAdjustmentReasonDto, user: TenantPrincipal) {
    const reason = await this.find(id, user.tenantId);
    if (reason.isSystemReason) throw new BadRequestException('System adjustment reasons cannot be modified.');
    const values = { ...dto } as Partial<InventoryAdjustmentReason>;
    if (dto.code !== undefined) values.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) {
      values.name = dto.name.trim();
      if (!values.name) throw new BadRequestException('Reason name is required.');
    }
    if (dto.reasonCategory !== undefined) values.reasonCategory = dto.reasonCategory.trim() || null;
    this.assertCostingDirection(dto.allowedDirection ?? reason.allowedDirection, dto.costingPolicy ?? reason.costingPolicy);
    Object.assign(reason, values, { tenantId: user.tenantId, isSystemReason: false });
    try { return await this.dataSource.getRepository(InventoryAdjustmentReason).save(reason); }
    catch (error) {
      if (error instanceof QueryFailedError) throw new ConflictException('Reason code already exists for this tenant.');
      throw error;
    }
  }

  async setActive(id: number, dto: SetInventoryAdjustmentReasonActiveDto, user: TenantPrincipal) {
    const reason = await this.find(id, user.tenantId);
    if (reason.isSystemReason) throw new BadRequestException('System adjustment reasons cannot be deactivated.');
    reason.isActive = dto.isActive;
    return this.dataSource.getRepository(InventoryAdjustmentReason).save(reason);
  }

  private async find(id: number, tenantId: number) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new BadRequestException('Invalid adjustment reason ID.');
    const reason = await this.dataSource.getRepository(InventoryAdjustmentReason).findOneBy({ inventoryAdjustmentReasonId: id, tenantId });
    if (!reason) throw new NotFoundException('Adjustment reason not found.');
    return reason;
  }

  private assertCostingDirection(direction: string, costingPolicy: string) {
    if (costingPolicy === 'MANUAL_REQUIRED' && direction !== 'IN')
      throw new BadRequestException('Manual-required costing is supported only for adjustment-in reasons.');
  }
}
