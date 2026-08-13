import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceListItem } from './price-list-items.entity';
import { CreatePriceListItemDto } from './dto/create-price-list-items.dto';
import { UpdatePriceListItemDto } from './dto/update-price-list-items.dto';
@Injectable()
export class PriceListItemService {
  constructor(@InjectRepository(PriceListItem) private readonly repo:Repository<PriceListItem> ) {}
  findAll() { return this.repo.find({order:{priceListItemId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({priceListItemId:id} as any);
    if(!row) throw new NotFoundException('PriceListItem not found');
    return row;
  }
  async create(dto:CreatePriceListItemDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdatePriceListItemDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
