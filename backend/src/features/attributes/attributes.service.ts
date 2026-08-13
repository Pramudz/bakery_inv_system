import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attribute } from './attributes.entity';
import { CreateAttributeDto } from './dto/create-attributes.dto';
import { UpdateAttributeDto } from './dto/update-attributes.dto';
@Injectable()
export class AttributeService {
  constructor(@InjectRepository(Attribute) private readonly repo:Repository<Attribute> ) {}
  findAll() { return this.repo.find({order:{attributeId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({attributeId:id} as any);
    if(!row) throw new NotFoundException('Attribute not found');
    return row;
  }
  async create(dto:CreateAttributeDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateAttributeDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
