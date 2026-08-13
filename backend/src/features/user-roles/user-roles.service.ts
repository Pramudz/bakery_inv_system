import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-roles.entity';
import { CreateUserRoleDto } from './dto/create-user-roles.dto';
import { UpdateUserRoleDto } from './dto/update-user-roles.dto';
@Injectable()
export class UserRoleService {
  constructor(@InjectRepository(UserRole) private readonly repo:Repository<UserRole> ) {}
  findAll() { return this.repo.find({order:{userRoleId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({userRoleId:id} as any);
    if(!row) throw new NotFoundException('UserRole not found');
    return row;
  }
  async create(dto:CreateUserRoleDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateUserRoleDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
