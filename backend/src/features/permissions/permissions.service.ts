import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './permissions.entity';
import { CreatePermissionDto } from './dto/create-permissions.dto';
import { UpdatePermissionDto } from './dto/update-permissions.dto';
@Injectable()
export class PermissionService {
  constructor(@InjectRepository(Permission) private readonly repo:Repository<Permission> ) {}
  findAll() { return this.repo.find({order:{permissionId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({permissionId:id} as any);
    if(!row) throw new NotFoundException('Permission not found');
    return row;
  }
  async create(dto:CreatePermissionDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdatePermissionDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
