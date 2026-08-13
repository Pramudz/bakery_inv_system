import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './roles.entity';
import { CreateRoleDto } from './dto/create-roles.dto';
import { UpdateRoleDto } from './dto/update-roles.dto';
@Injectable()
export class RoleService {
  constructor(@InjectRepository(Role) private readonly repo:Repository<Role> ) {}
  findAll() { return this.repo.find({order:{roleId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({roleId:id} as any);
    if(!row) throw new NotFoundException('Role not found');
    return row;
  }
  async create(dto:CreateRoleDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateRoleDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
