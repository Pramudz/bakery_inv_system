import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';

@Entity('tbl_payment_method')
@Index('uq_payment_method_tenant_name', ['tenantId', 'paymentMethodName'], { unique: true })
@Index('ix_payment_method_tenant_id', ['tenantId'])
export class PaymentMethod extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'payment_method_id', type: 'bigint' })
  paymentMethodId!: number;

  @Column({ name: 'tenant_id', type: 'bigint' })
  tenantId!: number;

  @ManyToOne(() => Tenant, (tenant) => tenant.paymentMethods, { nullable: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ name: 'payment_method_name', type: 'varchar', length: 150 })
  paymentMethodName!: string;

  @Column({ name: 'payment_method_type', type: 'varchar', length: 20, nullable: true })
  paymentMethodType!: PaymentMethodType | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;
}

export enum PaymentMethodType {
  CASH = 'CASH',
  CARD = 'CARD',
  CHEQUE = 'CHEQUE',
}
