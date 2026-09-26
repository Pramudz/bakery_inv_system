import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dto/create-categories.dto';
import { UpdateCategoryDto } from './dto/update-categories.dto';

@Injectable()
export class CategoryService {
  constructor(@InjectRepository(Category) private readonly repo: Repository<Category>) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { categoryId: 'ASC' },
    });
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
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.tenant', 'tenant')
      .leftJoinAndSelect('category.parentCategory', 'parentCategory')
      .where('category.tenantId = :tenantId', { tenantId });

    if (searchText) {
      query.andWhere(
        '(LOWER(category.categoryCode) LIKE LOWER(:search) OR LOWER(category.categoryName) LIKE LOWER(:search) OR LOWER(parentCategory.categoryName) LIKE LOWER(:search))',
        { search: `%${searchText}%` },
      );
    }
    if (status === 'active') {
      query.andWhere('category.isActive = :active', { active: true });
    }
    if (status === 'inactive') {
      query.andWhere('category.isActive = :active', { active: false });
    }

    const [items, total] = await query
      .orderBy('category.categoryId', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();

    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { categoryId: id, tenantId } as any,
    });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  async create(dto: CreateCategoryDto, tenantId: number) {
    const payload: any = { ...dto, tenantId };
    await this.validateParentCategory(dto.parentCategoryId, tenantId);
    const existing = await this.repo.findOne({
      where: {
        tenantId,
        categoryCode: (dto as any).categoryCode,
      } as any,
    });
    if (existing) throw new ConflictException('Code already exists for this tenant.');
    const existingName = await this.repo.findOne({
      where: { tenantId, categoryName: dto.categoryName } as any,
    });
    if (existingName) {
      throw new ConflictException('Category name already exists for this tenant.');
    }
    return this.repo.save(this.repo.create(payload));
  }

  async update(id: number, dto: UpdateCategoryDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const payload: any = { ...dto };
    delete payload.tenantId;
    if (payload.parentCategoryId !== undefined) {
      await this.validateParentCategory(payload.parentCategoryId, tenantId, id);
    }
    if (payload.categoryCode) {
      const same = await this.repo.findOne({
        where: { tenantId, categoryCode: payload.categoryCode } as any,
      });
      if (same && (same as any).categoryId !== id) {
        throw new ConflictException('Code already exists for this tenant.');
      }
    }
    if (payload.categoryName) {
      const same = await this.repo.findOne({
        where: { tenantId, categoryName: payload.categoryName } as any,
      });
      if (same && (same as any).categoryId !== id) {
        throw new ConflictException('Category name already exists for this tenant.');
      }
    }
    await this.repo.update({ categoryId: id, tenantId } as any, payload);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ categoryId: id, tenantId } as any, { isActive: false } as any);
    return this.findOne(id, tenantId);
  }

  async activate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ categoryId: id, tenantId } as any, { isActive: true } as any);
    return this.findOne(id, tenantId);
  }

  private async validateParentCategory(
    parentCategoryId: number | undefined,
    tenantId: number,
    categoryId?: number,
  ) {
    if (parentCategoryId === undefined || parentCategoryId === null) return;
    if (parentCategoryId === categoryId) {
      throw new ConflictException('A category cannot be its own parent.');
    }
    await this.findOne(parentCategoryId, tenantId);
  }
}
