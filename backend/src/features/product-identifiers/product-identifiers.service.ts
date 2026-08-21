import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { ProductIdentifier } from './product-identifiers.entity';
import { CreateProductIdentifierDto } from './dto/create-product-identifiers.dto';
import { UpdateProductIdentifierDto } from './dto/update-product-identifiers.dto';
import { Product } from '../products/products.entity';
import { IdentifierType } from '../identifier-types/identifier-types.entity';
import { normalizeProductIdentifier } from './product-identifier-normalization';
import { ProductUnit } from '../product-units/product-units.entity';

const POS_IDENTIFIER_TYPES = new Set(['BARCODE', 'EAN', 'UPC', 'GTIN', 'PLU']);

@Injectable()
export class ProductIdentifierService {
  constructor(
    @InjectRepository(ProductIdentifier) private readonly repo: Repository<ProductIdentifier>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { productIdentifierId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productIdentifierId: id, tenantId },
    });
    if (!row) throw new NotFoundException('ProductIdentifier not found');
    return row;
  }

  async create(dto: CreateProductIdentifierDto, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const parent = await manager.getRepository(Product).findOneBy({ productId: dto.productId, tenantId });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
      if (!await manager.getRepository(IdentifierType).findOneBy({ identifierTypeId: dto.identifierTypeId }))
        throw new NotFoundException('Identifier type not found.');
      await this.validateProductUnit(manager, dto.productId, tenantId, dto.identifierTypeId, dto.productUnitId);
      const normalizedIdentifierValue = normalizeProductIdentifier(dto.identifierValue);
      await this.assertAvailable(manager.getRepository(ProductIdentifier), tenantId, normalizedIdentifierValue);
      if (dto.isPrimary && await manager.getRepository(ProductIdentifier).countBy({ productId: dto.productId, tenantId, isPrimary: true, isActive: true }))
        throw new BadRequestException('Only one primary identifier is allowed per product.');
      return this.saveWithConflictMapping(manager.getRepository(ProductIdentifier), manager.getRepository(ProductIdentifier).create({
        ...dto,
        tenantId,
        identifierValue: dto.identifierValue.trim(),
        normalizedIdentifierValue,
      }));
    });
  }

  async update(id: number, dto: UpdateProductIdentifierDto, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductIdentifier);
      const row = await repo.findOneBy({ productIdentifierId: id, tenantId });
      if (!row) throw new NotFoundException('ProductIdentifier not found');
      const productId = dto.productId ?? row.productId;
      if (!await manager.getRepository(Product).findOneBy({ productId, tenantId }))
        throw new NotFoundException('Product not found for this tenant.');
      if (dto.identifierTypeId !== undefined && !await manager.getRepository(IdentifierType).findOneBy({ identifierTypeId: dto.identifierTypeId }))
        throw new NotFoundException('Identifier type not found.');
      const identifierTypeId = dto.identifierTypeId ?? row.identifierTypeId;
      const productUnitId = dto.productUnitId === undefined ? row.productUnitId ?? undefined : dto.productUnitId;
      await this.validateProductUnit(manager, productId, tenantId, identifierTypeId, productUnitId);
      const normalizedIdentifierValue = dto.identifierValue === undefined
        ? row.normalizedIdentifierValue
        : normalizeProductIdentifier(dto.identifierValue);
      await this.assertAvailable(repo, tenantId, normalizedIdentifierValue, id);
      if (dto.isPrimary && await repo.count({ where: { productId, tenantId, isPrimary: true, isActive: true, productIdentifierId: Not(id) } }))
        throw new BadRequestException('Only one primary identifier is allowed per product.');
      Object.assign(row, dto, {
        tenantId,
        productId,
        identifierValue: dto.identifierValue === undefined ? row.identifierValue : dto.identifierValue.trim(),
        normalizedIdentifierValue,
      });
      return this.saveWithConflictMapping(repo, row);
    });
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ productIdentifierId: id, tenantId }, { isActive: false });
    return this.findOne(id, tenantId);
  }

  private async assertAvailable(repo: Repository<ProductIdentifier>, tenantId: number, normalizedIdentifierValue: string, excludeId?: number) {
    const conflict = await repo.findOne({
      where: {
        tenantId,
        normalizedIdentifierValue,
        ...(excludeId ? { productIdentifierId: Not(excludeId) } : {}),
      },
    });
    if (conflict)
      throw new BadRequestException({
        message: 'Identifier already belongs to another product in this tenant.',
        identifierValue: normalizedIdentifierValue,
      });
  }

  private async saveWithConflictMapping(repo: Repository<ProductIdentifier>, row: ProductIdentifier) {
    try {
      return await repo.save(row);
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.driverError?.code === 'ER_DUP_ENTRY')
        throw new BadRequestException({
          message: 'Identifier already belongs to another product in this tenant.',
          identifierValue: row.normalizedIdentifierValue,
        });
      throw error;
    }
  }

  private async validateProductUnit(manager: any, productId: number, tenantId: number, identifierTypeId: number, productUnitId?: number) {
    const identifierType = await manager.getRepository(IdentifierType).findOneBy({ identifierTypeId, isActive: true });
    if (!identifierType) throw new NotFoundException('Identifier type not found.');
    const requiresBaseUnit = POS_IDENTIFIER_TYPES.has(identifierType.code.trim().toUpperCase());
    if (requiresBaseUnit && !productUnitId)
      throw new BadRequestException(`${identifierType.code} identifiers require the active base Product Unit.`);
    if (!productUnitId) return;
    const productUnit = await manager.getRepository(ProductUnit).findOne({
      where: { productUnitId, productId, isActive: true, product: { tenantId } } as any,
    });
    if (!productUnit) throw new BadRequestException('Identifier Product Unit must be active and belong to this product and tenant.');
    if (requiresBaseUnit && (!productUnit.isBaseUnit || !productUnit.isSalesUnit))
      throw new BadRequestException(`${identifierType.code} identifiers can only use the active base Product Unit.`);
  }
}
