import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dto/create-categories.dto';
import { UpdateCategoryDto } from './dto/update-categories.dto';

@Injectable()
export class CategoryService {
  constructor(@InjectRepository(Category) private readonly repo: Repository<Category>) {}
  findAll() { return this.repo.find({ order: { categoryId: 'ASC' } }); }
  async findOne(id: number) {
    const row = await this.repo.findOneBy({ categoryId: id } as any);
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }
  async create(dto: CreateCategoryDto) { return this.repo.save(this.repo.create(dto as any)); }
  async update(id: number, dto: UpdateCategoryDto) { await this.findOne(id); await this.repo.update(id, dto as any); return this.findOne(id); }
  async deactivate(id: number) { await this.findOne(id); await this.repo.update(id, { isActive: false } as any); return this.findOne(id); }
}
