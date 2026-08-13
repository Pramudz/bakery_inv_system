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

  findAll() {
    return this.repo.find({
      relations: { tenant: true, userRoles: { role: true } },
      order: { userId: 'ASC' },
    });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { userId: id }, relations: { tenant: true, userRoles: { role: true } } });
    if (!row) throw new NotFoundException('User not found');
    return row;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.repo.findOneBy({ tenantId: dto.tenantId, username: dto.username });
    if (existing) throw new ConflictException('Username already exists for this tenant');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const entity = this.repo.create({ ...dto, passwordHash } as any);
    delete (entity as any).password;
    return this.repo.save(entity);
  }

  async update(id: number, dto: UpdateUserDto) {
    await this.findOne(id);
    const update: any = { ...dto };
    if (dto.password) { update.passwordHash = await bcrypt.hash(dto.password, 12); delete update.password; }
    await this.repo.update(id, update);
    return this.findOne(id);
  }

  async deactivate(id: number) {
    await this.findOne(id);
    await this.repo.update(id, { isActive: false });
    return this.findOne(id);
  }
}
