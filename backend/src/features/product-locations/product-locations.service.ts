import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductLocation } from './product-locations.entity';
import { CreateProductLocationDto } from './dto/create-product-locations.dto';
import { UpdateProductLocationDto } from './dto/update-product-locations.dto';
import { Product } from '../products/products.entity';
import { Location } from '../locations/locations.entity';
import { assertProductOperationalReadiness } from '../products/product-operational-readiness';

@Injectable()
export class ProductLocationService {
  constructor(
    @InjectRepository(ProductLocation) private readonly repo: Repository<ProductLocation>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { product: { tenantId } } as any,
      order: { productLocationId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productLocationId: id, product: { tenantId } } as any,
    });
    if (!row) throw new NotFoundException('ProductLocation not found');
    return row;
  }

  async create(dto: CreateProductLocationDto, tenantId: number) {
    const parentRepo = this.dataSource.getRepository(Product);
    const parent = await parentRepo.findOne({ where: { productId: (dto as any).productId, tenantId } as any });
    if (!parent) throw new NotFoundException('Product not found for this tenant.');

    const secondRepo = this.dataSource.getRepository(Location);
    const second = await secondRepo.findOne({ where: { locationId: (dto as any).locationId, tenantId } as any });
    if (!second) throw new NotFoundException('Location not found for this tenant.');

    if (await this.repo.findOneBy({ productId: Number(dto.productId), locationId: Number(dto.locationId) }))
      throw new ConflictException('Location is already assigned to this product.');

    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id: number, dto: UpdateProductLocationDto, tenantId: number) {
    return this.dataSource.transaction(async manager => {
    const current = await manager.getRepository(ProductLocation).findOne({ where: { productLocationId: id, product: { tenantId } } as any });
    if (!current) throw new NotFoundException('ProductLocation not found');
    if ((dto as any).productId !== undefined) {
      const parent = await manager.getRepository(Product).findOne({ where: { productId: (dto as any).productId, tenantId } as any });
      if (!parent) throw new NotFoundException('Product not found for this tenant.');
    }
    if ((dto as any).locationId !== undefined) {
      const second = await manager.getRepository(Location).findOne({ where: { locationId: (dto as any).locationId, tenantId } as any });
      if (!second) throw new NotFoundException('Location not found for this tenant.');
    }
    const repository = manager.getRepository(ProductLocation);
    const duplicate = await repository.findOneBy({
      productId: Number((dto as any).productId ?? current.productId),
      locationId: Number((dto as any).locationId ?? current.locationId),
    });
    if (duplicate && Number(duplicate.productLocationId) !== id)
      throw new ConflictException('Location is already assigned to this product.');
    await repository.update(id, dto as any);
    await assertProductOperationalReadiness(manager, current.productId, tenantId);
    return repository.findOneByOrFail({ productLocationId: id });
    });
  }

  async deactivate(id: number, tenantId: number) {
    return this.dataSource.transaction(async manager => {
      const current = await manager.getRepository(ProductLocation).findOne({ where: { productLocationId: id, product: { tenantId } } as any });
      if (!current) throw new NotFoundException('ProductLocation not found');
      await manager.getRepository(ProductLocation).update(id, { isActive: false } as any);
      await assertProductOperationalReadiness(manager, current.productId, tenantId);
      return manager.getRepository(ProductLocation).findOneByOrFail({ productLocationId: id });
    });
  }
}
