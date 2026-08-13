import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductSupplierPrice } from './product-supplier-price.entity';
import { CreateProductSupplierPriceDto } from './dto/create-product-supplier-price.dto';
import { ProductSupplier } from '../product-suppliers/product-suppliers.entity';
import { ProductUnit } from '../product-units/product-units.entity';

@Injectable()
export class ProductSupplierPricesService {
  constructor(
    @InjectRepository(ProductSupplierPrice) private readonly repo: Repository<ProductSupplierPrice>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { productSupplier: { product: { tenantId } } } as any,
      relations: { productSupplier: { product: true }, productUnit: true },
      order: { productSupplierPriceId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productSupplierPriceId: id, productSupplier: { product: { tenantId } } } as any,
      relations: { productSupplier: { product: true }, productUnit: true },
    });
    if (!row) throw new NotFoundException('Product supplier price not found');
    return row;
  }

  async create(dto: CreateProductSupplierPriceDto, tenantId: number) {
    const supplierLink = await this.dataSource.getRepository(ProductSupplier).findOne({
      where: { productSupplierId: (dto as any).productSupplierId, product: { tenantId } } as any,
    });
    if (!supplierLink) throw new NotFoundException('Product supplier not found for this tenant.');

    const productUnit = await this.dataSource.getRepository(ProductUnit).findOne({
      where: { productUnitId: (dto as any).productUnitId, product: { tenantId } } as any,
    });
    if (!productUnit) throw new NotFoundException('Product unit not found for this tenant.');

    return this.repo.save(this.repo.create({
      ...dto,
      purchasePrice: String(dto.purchasePrice),
      minimumQuantity: String(dto.minimumQuantity),
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      currencyCode: dto.currencyCode ?? 'LKR',
    }));
  }
}
