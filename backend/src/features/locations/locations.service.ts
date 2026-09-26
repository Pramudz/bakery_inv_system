import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Location } from './locations.entity';
import { CreateLocationDto } from './dto/create-locations.dto';
import { UpdateLocationDto } from './dto/update-locations.dto';

@Injectable()
export class LocationService {
  constructor(@InjectRepository(Location) private readonly repo: Repository<Location>) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { locationId: 'ASC' },
    });
  }

  async findPage(
    tenantId: number,
    page: number,
    limit: number,
    search: string,
    status: string,
  ) {
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safeLimit = [20, 50, 100].includes(limit) ? limit : 20;
    const searchText = search.trim();
    const query = this.repo
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.tenant', 'tenant')
      .where('location.tenantId = :tenantId', { tenantId });

    if (searchText) {
      query.andWhere(
        `(LOWER(location.code) LIKE LOWER(:search)
          OR LOWER(location.name) LIKE LOWER(:search)
          OR LOWER(location.addressLine1) LIKE LOWER(:search)
          OR LOWER(location.addressLine2) LIKE LOWER(:search)
          OR LOWER(location.city) LIKE LOWER(:search)
          OR LOWER(location.stateProvince) LIKE LOWER(:search)
          OR LOWER(location.postalCode) LIKE LOWER(:search))`,
        { search: `%${searchText}%` },
      );
    }
    if (status === 'active') {
      query.andWhere('location.isActive = :active', { active: true });
    }
    if (status === 'inactive') {
      query.andWhere('location.isActive = :active', { active: false });
    }

    const [rows, total] = await query
      .orderBy('location.locationId', 'ASC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();
    const items = rows.map((row) => {
      const { tenantId: _tenantId, ...item } = row;
      return item;
    });

    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { locationId: id, tenantId } as any,
    });
    if (!row) throw new NotFoundException('Location not found');
    return row;
  }

  async create(dto: CreateLocationDto, tenantId: number) {
    const payload: any = { ...this.cleanPayload(dto), tenantId };
    const existing = await this.repo.findOne({
      where: {
        tenantId,
        code: dto.code.trim().toUpperCase(),
      } as any,
    });
    if (existing) throw new ConflictException('Code already exists for this tenant.');
    return this.repo.save(this.repo.create(payload));
  }

  async update(id: number, dto: UpdateLocationDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const payload: any = this.cleanPayload(dto);
    delete payload.tenantId;
    if (payload.code) {
      const same = await this.repo.findOne({
        where: { tenantId, code: payload.code, locationId: Not(id) } as any,
      });
      if (same) {
        throw new ConflictException('Code already exists for this tenant.');
      }
    }
    await this.repo.update({ locationId: id, tenantId } as any, payload);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ locationId: id, tenantId } as any, { isActive: false } as any);
    return this.findOne(id, tenantId);
  }

  async activate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ locationId: id, tenantId } as any, { isActive: true } as any);
    return this.findOne(id, tenantId);
  }

  private cleanPayload(dto: Partial<CreateLocationDto>) {
    const payload: Record<string, unknown> = { ...dto };
    for (const key of Object.keys(payload)) {
      if (typeof payload[key] === 'string') payload[key] = (payload[key] as string).trim() || null;
    }
    if (typeof payload.code === 'string') payload.code = payload.code.toUpperCase();
    if (typeof payload.countryCode === 'string') payload.countryCode = payload.countryCode.toUpperCase();
    return payload;
  }
}
