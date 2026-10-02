import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantPrincipal } from '../auth/auth.types';
import { CreatePaymentChannelDto } from './dto/create-payment-channel.dto';
import { UpdatePaymentChannelDto } from './dto/update-payment-channel.dto';
import { PaymentChannel } from './payment-channel.entity';

@Injectable()
export class PaymentChannelsService {
  constructor(@InjectRepository(PaymentChannel) private readonly repo: Repository<PaymentChannel>) {}

  findAll(user: TenantPrincipal, activeOnly = false) {
    return this.repo.find({
      where: { tenantId: user.tenantId, ...(activeOnly ? { isActive: true } : {}) },
      order: { name: 'ASC', paymentChannelId: 'ASC' },
    });
  }

  async create(dto: CreatePaymentChannelDto, user: TenantPrincipal) {
    await this.ensureCode(dto.code, user.tenantId);
    return this.repo.save(this.repo.create({ tenantId: user.tenantId, code: dto.code.trim().toUpperCase(), name: dto.name.trim(), isActive: true }));
  }

  async update(id: number, dto: UpdatePaymentChannelDto, user: TenantPrincipal) {
    await this.get(id, user);
    if (dto.code) await this.ensureCode(dto.code, user.tenantId, id);
    await this.repo.update({ paymentChannelId: id, tenantId: user.tenantId }, { ...dto, code: dto.code?.trim().toUpperCase(), name: dto.name?.trim() });
    return this.get(id, user);
  }

  async setActive(id: number, active: boolean, user: TenantPrincipal) {
    await this.get(id, user);
    await this.repo.update({ paymentChannelId: id, tenantId: user.tenantId }, { isActive: active });
    return this.get(id, user);
  }

  private async get(id: number, user: TenantPrincipal) {
    const row = await this.repo.findOne({ where: { paymentChannelId: id, tenantId: user.tenantId } });
    if (!row) throw new NotFoundException('Card channel not found.');
    return row;
  }
  private async ensureCode(code: string, tenantId: number, currentId?: number) {
    const row = await this.repo.findOneBy({ tenantId, code: code.trim().toUpperCase() });
    if (row && Number(row.paymentChannelId) !== Number(currentId)) throw new ConflictException('A card channel with this code already exists for the tenant.');
  }
}
