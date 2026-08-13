import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      relations: { tenant: true, userRoles: { role: true } },
      order: { userId: 'ASC' },
    });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { userId: id, tenantId },
      relations: { tenant: true, userRoles: { role: true } },
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

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const payload: any = { ...dto, tenantId, passwordHash };
    delete payload.password;
    delete payload.tenantId;

    return this.repo.save(this.repo.create({
      ...payload,
      tenantId,
    } as any));
  }

  async update(id: number, dto: UpdateUserDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const update: any = { ...dto };
    delete update.tenantId;

    if (dto.password) {
      update.passwordHash = await bcrypt.hash(dto.password, 12);
      delete update.password;
    }

    await this.repo.update({ userId: id, tenantId }, update);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ userId: id, tenantId }, { isActive: false });
    return this.findOne(id, tenantId);
  }
}
