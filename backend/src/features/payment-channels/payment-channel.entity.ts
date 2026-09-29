import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';

@Entity('tbl_payment_channel')
@Index('uq_payment_channel_tenant_code', ['tenantId', 'code'], { unique: true })
@Index('ix_payment_channel_tenant_active', ['tenantId', 'isActive'])
export class PaymentChannel extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'payment_channel_id', type: 'bigint' }) paymentChannelId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'code', type: 'varchar', length: 50 }) code!: string;
  @Column({ name: 'name', type: 'varchar', length: 150 }) name!: string;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
}
