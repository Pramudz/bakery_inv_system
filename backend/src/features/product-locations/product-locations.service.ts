import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductLocation } from './product-locations.entity';
import { CreateProductLocationDto } from './dto/create-product-locations.dto';
import { UpdateProductLocationDto } from './dto/update-product-locations.dto';
@Injectable()
export class ProductLocationService {
  constructor(@InjectRepository(ProductLocation) private readonly repo:Repository<ProductLocation> ) {}
  findAll() { return this.repo.find({order:{productLocationId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({productLocationId:id} as any);
    if(!row) throw new NotFoundException('ProductLocation not found');
    return row;
  }
  async create(dto:CreateProductLocationDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateProductLocationDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
