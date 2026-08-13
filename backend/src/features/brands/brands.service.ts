import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './brands.entity';
import { CreateBrandDto } from './dto/create-brands.dto';
import { UpdateBrandDto } from './dto/update-brands.dto';
@Injectable()
export class BrandService {
  constructor(@InjectRepository(Brand) private readonly repo:Repository<Brand> ) {}
  findAll() { return this.repo.find({order:{brandId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({brandId:id} as any);
    if(!row) throw new NotFoundException('Brand not found');
    return row;
  }
  async create(dto:CreateBrandDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateBrandDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
