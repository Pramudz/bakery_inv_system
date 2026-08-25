import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { PriceListItem } from '../price-list-items/price-list-items.entity';
import { Tenant } from '../tenants/tenant.entity';
import { User } from '../users/user.entity';

export enum PriceListItemDiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

@Entity('tbl_price_list_item_discount')
@Index('idx_price_item_discount_active_period', ['tenantId', 'priceListItemId', 'isActive', 'effectiveFrom', 'effectiveTo'])
@Index('idx_price_item_discount_history', ['tenantId', 'priceListItemId', 'effectiveFrom'])
export class PriceListItemDiscount extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'price_list_item_discount_id', type: 'bigint' }) priceListItemDiscountId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @Column({ name: 'price_list_item_id', type: 'bigint' }) priceListItemId!: number;
  @ManyToOne(() => PriceListItem, (item) => item.discounts, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'price_list_item_id' }) priceListItem!: PriceListItem;
  @Column({ name: 'discount_type', type: 'enum', enum: PriceListItemDiscountType }) discountType!: PriceListItemDiscountType;
  @Column({ name: 'discount_value', type: 'decimal', precision: 18, scale: 4 }) discountValue!: string;
  @Column({ name: 'effective_from', type: 'datetime', precision: 3 }) effectiveFrom!: Date;
  @Column({ name: 'effective_to', type: 'datetime', precision: 3, nullable: true }) effectiveTo!: Date | null;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Column({ name: 'created_by', type: 'bigint' }) createdBy!: number;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'created_by' }) createdByUser!: User;
  @Column({ name: 'ended_by', type: 'bigint', nullable: true }) endedBy!: number | null;
  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'ended_by' }) endedByUser!: User | null;
}
