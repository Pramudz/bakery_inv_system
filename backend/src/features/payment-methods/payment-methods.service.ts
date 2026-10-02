import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethod } from './payment-methods.entity';

@Injectable()
export class PaymentMethodsService {
  constructor(@InjectRepository(PaymentMethod) private readonly repo: Repository<PaymentMethod>, private readonly dataSource: DataSource) {}

  findAll(tenantId: number) {
    return this.repo.find({ where: { tenantId }, order: { paymentMethodId: 'ASC' } });
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({ where: { paymentMethodId: id, tenantId } });
    if (!row) throw new NotFoundException('Payment method not found');
    return row;
  }

  async create(dto: CreatePaymentMethodDto, tenantId: number) {
    await this.ensureNameAvailable(dto.paymentMethodName, tenantId);
    return this.repo.save(this.repo.create({ ...dto, tenantId }));
  }

  async update(id: number, dto: UpdatePaymentMethodDto, tenantId: number) {
    const current = await this.findOne(id, tenantId);
    if (dto.paymentMethodName) await this.ensureNameAvailable(dto.paymentMethodName, tenantId, id);
    if (dto.paymentMethodType && current.paymentMethodType !== dto.paymentMethodType) {
      const rows = await this.dataSource.query(`
        SELECT
          (SELECT COUNT(*) FROM tbl_invoice_payment WHERE payment_method_id = ?) +
          (SELECT COUNT(*) FROM tbl_invoice_refund_payment WHERE payment_method_id = ?) +
          (SELECT COUNT(*) FROM tbl_invoice_adjustment WHERE payment_method_id = ?) AS transactionCount`, [id, id, id]);
      if (Number(rows[0]?.transactionCount ?? 0) > 0) {
        throw new ConflictException('The payment method type cannot be changed because the method has transaction history. Create a new method instead.');
      }
    }
    await this.repo.update({ paymentMethodId: id, tenantId }, dto);
    return this.findOne(id, tenantId);
  }

  async setActive(id: number, tenantId: number, isActive: boolean) {
    await this.findOne(id, tenantId);
    await this.repo.update({ paymentMethodId: id, tenantId }, { isActive });
    return this.findOne(id, tenantId);
  }

  private async ensureNameAvailable(name: string, tenantId: number, currentId?: number) {
    const existing = await this.repo.findOne({ where: { tenantId, paymentMethodName: name.trim() } });
    if (existing && existing.paymentMethodId !== currentId) {
      throw new ConflictException('Payment method already exists for this tenant.');
    }
  }
}
