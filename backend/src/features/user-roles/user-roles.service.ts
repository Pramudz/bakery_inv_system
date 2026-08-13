import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from './user-roles.entity';
import { User } from '../users/user.entity';
import { Role } from '../roles/roles.entity';
import { CreateUserRoleDto } from './dto/create-user-roles.dto';
import { UpdateUserRoleDto } from './dto/update-user-roles.dto';

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(UserRole) private readonly repo: Repository<UserRole>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId:number) {
    return this.repo.find({ where: { user: { tenantId } } as any, relations: { user: true }, order: { userRoleId:'ASC' } });
  }

  async findOne(id:number, tenantId:number) {
    const row=await this.repo.findOne({ where: { userRoleId:id, user:{ tenantId } } as any, relations: { user:true } });
    if(!row) throw new NotFoundException('UserRole not found');
    return row;
  }

  async create(dto:CreateUserRoleDto, tenantId:number) {
    const parent=await this.dataSource.getRepository(User).findOne({ where: { userId:(dto as any).userId, tenantId } as any });
    if(!parent) throw new NotFoundException('User not found for this tenant.');
    const second=await this.dataSource.getRepository(Role).findOne({ where: { roleId:(dto as any).roleId, tenantId } as any });
    if(!second) throw new NotFoundException('Role not found.');
    const duplicate=await this.repo.findOne({ where: { userId:(dto as any).userId, roleId:(dto as any).roleId } as any });
    if(duplicate) throw new ConflictException('Relationship already exists.');
    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id:number,dto:UpdateUserRoleDto,tenantId:number) {
    await this.findOne(id,tenantId);
    await this.repo.update(id,dto as any);
    return this.findOne(id,tenantId);
  }
}
