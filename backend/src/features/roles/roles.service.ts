import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './roles.entity';
import { CreateRoleDto } from './dto/create-roles.dto';
import { UpdateRoleDto } from './dto/update-roles.dto';

@Injectable()
export class RoleService {
  constructor(@InjectRepository(Role) private readonly repo: Repository<Role>) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { roleId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { roleId: id, tenantId } as any,
    });
    if (!row) throw new NotFoundException('Role not found');
    return row;
  }

  async create(dto: CreateRoleDto, tenantId: number) {
    const payload: any = { ...dto, tenantId };
    const existing = await this.repo.findOne({
      where: {
        tenantId,
        code: (dto as any).code,
      } as any,
    });
    if (existing) throw new ConflictException('Code already exists for this tenant.');
    return this.repo.save(this.repo.create(payload));
  }

  async update(id: number, dto: UpdateRoleDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const payload: any = { ...dto };
    delete payload.tenantId;
    if (payload.code) {
      const same = await this.repo.findOne({
        where: { tenantId, code: payload.code } as any,
      });
      if (same && (same as any).roleId !== id) {
        throw new ConflictException('Code already exists for this tenant.');
      }
    }
    await this.repo.update({ roleId: id, tenantId } as any, payload);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ roleId: id, tenantId } as any, { isActive: false } as any);
    return this.findOne(id, tenantId);
  }
}
