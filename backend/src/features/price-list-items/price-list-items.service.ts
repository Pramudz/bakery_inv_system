import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PriceListItem } from './price-list-items.entity';
import { CreatePriceListItemDto } from './dto/create-price-list-items.dto';
import { UpdatePriceListItemDto } from './dto/update-price-list-items.dto';
import { PriceList } from '../price-lists/price-lists.entity';
import { Product } from '../products/products.entity';
import { ProductUnit } from '../product-units/product-units.entity';
import { assertProductOperationalReadiness } from '../products/product-operational-readiness';

@Injectable()
export class PriceListItemService {
  constructor(
    @InjectRepository(PriceListItem) private readonly repo: Repository<PriceListItem>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { priceList: { tenantId } } as any,
      order: { priceListItemId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { priceListItemId: id, priceList: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('PriceListItem not found');
    return row;
  }

  async create(dto: CreatePriceListItemDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(PriceList);
    const parent = await parentRepo.findOne({ where: { priceListId: (dto as any).priceListId, tenantId } as any });
    if (!parent) throw new NotFoundException('Price list not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(Product);
    const second = await secondRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!second) throw new NotFoundException('Product not found for this tenant.');

    const productUnit = await this.dataSource.getRepository(ProductUnit).findOneBy({ productId: dto.productId, unitId: dto.unitId, isActive: true });
    if (!productUnit) throw new NotFoundException('Active Product Unit not found for this product.');
    if (!productUnit.isBaseUnit || !productUnit.isSalesUnit || Number(productUnit.conversionFactor) !== 1)
      throw new BadRequestException('Selling prices can only use the active base Product Unit.');
    return this.repo.save(this.repo.create({ ...dto, tenantId, productUnitId: productUnit.productUnitId } as any));
  }

  async update(id: number, dto: UpdatePriceListItemDto, tenantId: number) {
    return this.dataSource.transaction(async manager => {
    const existing = await manager.getRepository(PriceListItem).findOne({ where: { priceListItemId: id, priceList: { tenantId } } as any });
    if (!existing) throw new NotFoundException('PriceListItem not found');
    if ((dto as any).priceListId !== undefined) {
      const parent = await manager.getRepository(PriceList).findOne({ where: { priceListId: (dto as any).priceListId, tenantId } as any });
      if (!parent) throw new NotFoundException('Price list not found for this tenant.');
    }
    if ((dto as any).productId !== undefined) {
      const second = await manager.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!second) throw new NotFoundException('Product not found for this tenant.');
    }
    const productId = Number((dto as any).productId ?? existing.productId);
    const unitId = Number((dto as any).unitId ?? existing.unitId);
    const productUnit = await manager.getRepository(ProductUnit).findOneBy({ productId, unitId, isActive: true });
    if (!productUnit) throw new NotFoundException('Active Product Unit not found for this product.');
    if (!productUnit.isBaseUnit || !productUnit.isSalesUnit || Number(productUnit.conversionFactor) !== 1)
      throw new BadRequestException('Selling prices can only use the active base Product Unit.');
    await manager.getRepository(PriceListItem).update(id, { ...dto, tenantId, productUnitId: productUnit.productUnitId } as any);
    await assertProductOperationalReadiness(manager, productId, tenantId);
    return manager.getRepository(PriceListItem).findOneByOrFail({ priceListItemId: id });
    });
  }

  async deactivate(id: number, tenantId: number) {
    return this.dataSource.transaction(async manager => {
      const existing = await manager.getRepository(PriceListItem).findOne({ where: { priceListItemId: id, priceList: { tenantId } } as any });
      if (!existing) throw new NotFoundException('PriceListItem not found');
      await manager.getRepository(PriceListItem).update(id, { isActive: false } as any);
      await assertProductOperationalReadiness(manager, existing.productId, tenantId);
      return manager.getRepository(PriceListItem).findOneByOrFail({ priceListItemId: id });
    });
  }
}
