import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { NumberSequenceKeys } from '../number-sequences/number-sequence-keys';
import { formatSupplierCode } from '../number-sequences/number-sequence-formatters';
import { NumberSequencesService } from '../number-sequences/number-sequences.service';
import { Supplier } from './suppliers.entity';
import { CreateSupplierDto } from './dto/create-suppliers.dto';
import { UpdateSupplierDto } from './dto/update-suppliers.dto';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier) private readonly repo: Repository<Supplier>,
    private readonly dataSource: DataSource,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({ where: { tenantId }, order: { supplierId: 'ASC' } });
  }

  async findPage(
    tenantId: number,
    page: number,
    limit: number,
    search: string,
    status: string,
  ) {
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safeLimit = [20, 50, 100].includes(limit) ? limit : 20;
    const searchText = search.trim();
    const query = this.repo
      .createQueryBuilder('supplier')
      .where('supplier.tenantId = :tenantId', { tenantId });

    if (searchText) {
      query.andWhere(
        `(LOWER(supplier.supplierCode) LIKE LOWER(:search)
          OR LOWER(supplier.supplierName) LIKE LOWER(:search)
          OR LOWER(supplier.contactName) LIKE LOWER(:search)
          OR LOWER(supplier.phone) LIKE LOWER(:search)
          OR LOWER(supplier.mobile) LIKE LOWER(:search)
          OR LOWER(supplier.email) LIKE LOWER(:search)
          OR LOWER(supplier.city) LIKE LOWER(:search))`,
        { search: `%${searchText}%` },
      );
    }
    if (status === 'active') {
      query.andWhere('supplier.isActive = :active', { active: true });
    }
    if (status === 'inactive') {
      query.andWhere('supplier.isActive = :active', { active: false });
    }

    const [rows, total] = await query
      .orderBy('supplier.supplierName', 'ASC')
      .addOrderBy('supplier.supplierId', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();
    const items = rows.map((row) => {
      const { tenantId: _tenantId, ...item } = row;
      return item;
    });
    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOneBy({ supplierId: id, tenantId });
    if (!row) throw new NotFoundException('Supplier not found');
    return row;
  }

  async create(dto: CreateSupplierDto, tenantId: number) {
    try {
      const supplierId = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Supplier);
        const manualCode = this.normalizeCode(dto.supplierCode);
        let supplierCode: string;
        if (manualCode) {
          if (await repository.findOneBy({ tenantId, supplierCode: manualCode })) throw new ConflictException('Supplier code already exists for this tenant.');
          supplierCode = manualCode;
        } else supplierCode = await this.nextAvailableCode(manager, tenantId);
        const supplier = await repository.save(repository.create({
          tenantId,
          supplierCode,
          ...this.directPayload(dto),
        }));
        return supplier.supplierId;
      });
      return this.findOne(Number(supplierId), tenantId);
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async update(id: number, dto: UpdateSupplierDto, tenantId: number) {
    try {
      await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Supplier);
        const supplier = await repository.findOneBy({ supplierId: id, tenantId });
        if (!supplier) throw new NotFoundException('Supplier not found');
        Object.assign(supplier, this.directPayload(dto));
        await repository.save(supplier);
      });
      return this.findOne(id, tenantId);
    } catch (error) {
      this.rethrowConstraint(error);
    }
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ supplierId: id, tenantId }, { isActive: false });
    return this.findOne(id, tenantId);
  }

  private async nextAvailableCode(manager: EntityManager, tenantId: number) {
    const repository = manager.getRepository(Supplier);
    for (;;) {
      const nextNumber = await this.numberSequences.getTenantNextNumber(manager, tenantId, NumberSequenceKeys.SUPPLIER);
      const code = formatSupplierCode(nextNumber);
      if (!await repository.findOneBy({ tenantId, supplierCode: code })) return code;
    }
  }

  private directPayload(dto: Partial<CreateSupplierDto>) {
    const payload: Partial<Supplier> = {};
    if (dto.supplierName !== undefined) payload.supplierName = dto.supplierName.trim();
    if (dto.isActive !== undefined) payload.isActive = dto.isActive;
    else if ('supplierName' in dto) payload.isActive = true;
    for (const key of ['contactName', 'phone', 'mobile', 'email', 'addressLine1', 'addressLine2', 'city', 'districtOrState', 'postalCode'] as const) {
      if (dto[key] !== undefined) payload[key] = this.cleanOptional(dto[key]);
    }
    if (dto.countryCode !== undefined) payload.countryCode = this.cleanOptional(dto.countryCode)?.toUpperCase() ?? null;
    return payload;
  }

  private normalizeCode(value?: string | null) { return value?.trim().toUpperCase() || null; }
  private cleanOptional(value?: string | null) { return typeof value === 'string' ? value.trim() || null : value ?? null; }
  private rethrowConstraint(error: unknown): never {
    if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
    if ((error as { code?: string })?.code === 'ER_DUP_ENTRY') throw new ConflictException('Supplier code already exists for this tenant.');
    throw error;
  }
}
