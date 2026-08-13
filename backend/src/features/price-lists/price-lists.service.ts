import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceList } from './price-lists.entity';
import { CreatePriceListDto } from './dto/create-price-lists.dto';
import { UpdatePriceListDto } from './dto/update-price-lists.dto';
@Injectable()
export class PriceListService {
  constructor(@InjectRepository(PriceList) private readonly repo:Repository<PriceList> ) {}
  findAll() { return this.repo.find({order:{priceListId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({priceListId:id} as any);
    if(!row) throw new NotFoundException('PriceList not found');
    return row;
  }
  async create(dto:CreatePriceListDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdatePriceListDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
