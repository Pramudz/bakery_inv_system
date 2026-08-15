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
      if (same && (same as any).customerId !== id) {
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
