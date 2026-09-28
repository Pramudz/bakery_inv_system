import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './customers.entity';
import { CreateCustomerDto } from './dto/create-customers.dto';
import { UpdateCustomerDto } from './dto/update-customers.dto';

@Injectable()
export class CustomerService {
  constructor(@InjectRepository(Customer) private readonly repo: Repository<Customer>) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      order: { customerId: 'ASC' },
    });
  }

  async findPage(
    tenantId: number,
    page: number,
    limit: number,
    search: string,
    status: string,
  ) {
    const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
    const safeLimit = [20, 50, 100].includes(limit) ? limit : 20;
    const searchText = search.trim();
    const query = this.repo
      .createQueryBuilder('customer')
      .where('customer.tenantId = :tenantId', { tenantId });

    if (searchText) {
      query.andWhere(
        `(LOWER(customer.customerCode) LIKE LOWER(:search)
          OR LOWER(customer.customerName) LIKE LOWER(:search)
          OR LOWER(customer.contactName) LIKE LOWER(:search)
          OR LOWER(customer.phone) LIKE LOWER(:search)
          OR LOWER(customer.mobile) LIKE LOWER(:search)
          OR LOWER(customer.email) LIKE LOWER(:search)
          OR LOWER(customer.city) LIKE LOWER(:search))`,
        { search: `%${searchText}%` },
      );
    }
    if (status === 'active') {
      query.andWhere('customer.isActive = :active', { active: true });
    }
    if (status === 'inactive') {
      query.andWhere('customer.isActive = :active', { active: false });
    }

    const [rows, total] = await query
      .orderBy('customer.customerName', 'ASC')
      .addOrderBy('customer.customerId', 'ASC')
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
      where: { customerId: id, tenantId } as any,
    });
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  async create(dto: CreateCustomerDto, tenantId: number) {
    const payload: any = { ...dto, tenantId };
    const existing = await this.repo.findOne({
      where: {
        tenantId,
        customerCode: (dto as any).customerCode,
      } as any,
    });
    if (existing) throw new ConflictException('Code already exists for this tenant.');
    return this.repo.save(this.repo.create(payload));
  }

  async update(id: number, dto: UpdateCustomerDto, tenantId: number) {
    await this.findOne(id, tenantId);
    const payload: any = { ...dto };
    delete payload.tenantId;
    if (payload.customerCode) {
      const same = await this.repo.findOne({
        where: { tenantId, customerCode: payload.customerCode } as any,
      });
      if (same && Number(same.customerId) !== Number(id)) {
        throw new ConflictException('Code already exists for this tenant.');
      }
    }
    await this.repo.update({ customerId: id, tenantId } as any, payload);
    return this.findOne(id, tenantId);
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ customerId: id, tenantId } as any, { isActive: false } as any);
    return this.findOne(id, tenantId);
  }
}
