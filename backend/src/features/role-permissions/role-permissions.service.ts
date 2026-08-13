import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RolePermission } from './role-permissions.entity';
import { Role } from '../roles/roles.entity';
import { Permission } from '../permissions/permissions.entity';
import { CreateRolePermissionDto } from './dto/create-role-permissions.dto';
import { UpdateRolePermissionDto } from './dto/update-role-permissions.dto';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';

@Injectable()
export class RolePermissionService {
  constructor(
    @InjectRepository(RolePermission) private readonly repo: Repository<RolePermission>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tenantId:number) {
    return this.repo.find({ where: { role: { tenantId } } as any, relations: { role: true }, order: { rolePermissionId:'ASC' } });
  }

  async findOne(id:number, tenantId:number) {
    const row=await this.repo.findOne({ where: { rolePermissionId:id, role:{ tenantId } } as any, relations: { role:true } });
    if(!row) throw new NotFoundException('RolePermission not found');
    return row;
  }

  async create(dto:CreateRolePermissionDto, tenantId:number) {
    const parent=await this.dataSource.getRepository(Role).findOne({ where: { roleId:(dto as any).roleId, tenantId } as any });
    if(!parent) throw new NotFoundException('Role not found for this tenant.');
    const second=await this.dataSource.getRepository(Permission).findOne({ where: { permissionId:(dto as any).permissionId } as any });
    if(!second) throw new NotFoundException('Permission not found.');
    const enabled = await this.dataSource.getRepository(TenantModule).findOneBy({ tenantId, moduleId: second.moduleId, isEnabled: true });
    if (!enabled) throw new NotFoundException('Permission module is not enabled for this tenant.');
    const duplicate=await this.repo.findOne({ where: { roleId:(dto as any).roleId, permissionId:(dto as any).permissionId } as any });
    if(duplicate) throw new ConflictException('Relationship already exists.');
    return this.repo.save(this.repo.create(dto as any));
  }

  async update(id:number,dto:UpdateRolePermissionDto,tenantId:number) {
    await this.findOne(id,tenantId);
    await this.repo.update(id,dto as any);
    return this.findOne(id,tenantId);
  }
}
