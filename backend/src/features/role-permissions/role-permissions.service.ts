import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolePermission } from './role-permissions.entity';
import { CreateRolePermissionDto } from './dto/create-role-permissions.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permissions.dto';
@Injectable()
export class RolePermissionService {
  constructor(@InjectRepository(RolePermission) private readonly repo:Repository<RolePermission> ) {}
  findAll() { return this.repo.find({order:{rolePermissionId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({rolePermissionId:id} as any);
    if(!row) throw new NotFoundException('RolePermission not found');
    return row;
  }
  async create(dto:CreateRolePermissionDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateRolePermissionDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
