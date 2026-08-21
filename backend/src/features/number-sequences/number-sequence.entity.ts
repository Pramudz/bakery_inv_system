import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';

@Entity('tbl_number_sequence')
@Unique('uq_number_sequence_scope', [
  'tenantId',
  'sequenceKey',
  'scopeKey',
  'periodKey',
])
export class NumberSequence extends AuditEntity {
  @PrimaryGeneratedColumn({
    name: 'number_sequence_id',
    type: 'bigint',
  })
  numberSequenceId!: number;

  @Column({
    name: 'tenant_id',
    type: 'bigint',
  })
  tenantId!: number;

  @Column({
    name: 'sequence_key',
    type: 'varchar',
    length: 50,
  })
  sequenceKey!: string;

  @Column({ name: 'scope_key', type: 'varchar', length: 100 })
  scopeKey!: string;

  @Column({ name: 'period_key', type: 'varchar', length: 20 })
  periodKey!: string;

  @Column({
    name: 'last_number',
    type: 'bigint',
    default: 0,
  })
  lastNumber!: number;
}
