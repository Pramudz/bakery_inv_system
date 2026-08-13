import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../roles/roles.entity';
import { Location } from '../locations/locations.entity';
import { UserRole } from '../user-roles/user-roles.entity';
import { UserLocation } from '../user-locations/user-locations.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>, private readonly dataSource: DataSource) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      relations: { tenant: true, userRoles: { role: true }, userLocations: { location: true } },
      order: { userId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { userId: id, tenantId },
      relations: { tenant: true, userRoles: { role: true }, userLocations: { location: true } },
    });
    if (!row) throw new NotFoundException('User not found');
    return row;
  }

  async create(dto: CreateUserDto, tenantId: number) {
    const existing = await this.repo.findOneBy({
      tenantId,
      username: dto.username,
    });
    if (existing) throw new ConflictException('Username already exists for this tenant');

    const userId = await this.dataSource.transaction(async (manager) => {
      const role = await manager.getRepository(Role).findOneBy({ roleId: dto.roleId, tenantId });
      if (!role) throw new NotFoundException('Role not found for this tenant.');
      await this.validateLocations(manager, dto.locationIds ?? [], dto.defaultLocationId, tenantId, role.accessScope);
      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = await manager.getRepository(User).save(manager.getRepository(User).create({ username: dto.username, email: dto.email ?? null, passwordHash, firstName: dto.firstName ?? null, lastName: dto.lastName ?? null, mobile: dto.mobile ?? null, isActive: dto.isActive ?? true, tenantId }));
      await manager.getRepository(UserRole).save(manager.getRepository(UserRole).create({ userId: user.userId, roleId: role.roleId, assignedAt: new Date() }));
      await this.replaceLocations(manager, user.userId, tenantId, dto.locationIds ?? [], dto.defaultLocationId);
      return user.userId;
    });
    return this.findOne(userId, tenantId);
  }

  async update(id: number, dto: UpdateUserDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const update: any = { ...dto };
    delete update.tenantId;

    if (dto.password) {
      update.passwordHash = await bcrypt.hash(dto.password, 12);
      delete update.password;
    }

    await this.dataSource.transaction(async (manager) => {
      const currentRole = await manager.getRepository(UserRole).findOne({ where: { userId: id }, relations: { role: true } });
      const role = await manager.getRepository(Role).findOneBy({ roleId: dto.roleId ?? currentRole?.roleId, tenantId } as any);
      if (!role) throw new NotFoundException('Role not found for this tenant.');
      const locationIds = dto.locationIds ?? (await manager.getRepository(UserLocation).findBy({ userId: id, tenantId, isActive: true })).map(row => row.locationId);
      await this.validateLocations(manager, locationIds, dto.defaultLocationId, tenantId, role.accessScope);
      delete update.roleId; delete update.locationIds; delete update.defaultLocationId;
      await manager.getRepository(User).update({ userId: id, tenantId }, update);
      if (dto.roleId && currentRole) await manager.getRepository(UserRole).update({ userRoleId: currentRole.userRoleId }, { roleId: dto.roleId, assignedAt: new Date() });
      if (dto.locationIds !== undefined) await this.replaceLocations(manager, id, tenantId, dto.locationIds, dto.defaultLocationId);
    });
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ userId: id, tenantId }, { isActive: false });
    return this.findOne(id, tenantId);
  }

  private async validateLocations(manager: EntityManager, locationIds: number[], defaultLocationId: number | undefined, tenantId: number, accessScope: string) {
    const ids = [...new Set(locationIds)];
    if (accessScope === 'LOCATION' && !ids.length) throw new ConflictException('Location-based users require at least one location.');
    if (defaultLocationId !== undefined && !ids.includes(defaultLocationId)) throw new ConflictException('Default location must be assigned to the user.');
    if (!ids.length) return;
    const locations = await manager.getRepository(Location).findBy({ tenantId, locationId: In(ids), isActive: true });
    if (locations.length !== ids.length) throw new NotFoundException('One or more locations are not active locations for this tenant.');
  }

  private async replaceLocations(manager: EntityManager, userId: number, tenantId: number, locationIds: number[], defaultLocationId?: number) {
    await manager.getRepository(UserLocation).delete({ userId, tenantId });
    const ids = [...new Set(locationIds)];
    if (ids.length) await manager.getRepository(UserLocation).save(ids.map(locationId => manager.getRepository(UserLocation).create({ userId, tenantId, locationId, isActive: true, isDefault: defaultLocationId ? locationId === defaultLocationId : locationId === ids[0] })));
  }
}
