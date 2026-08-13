import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { Tenant } from '../tenants/tenant.entity';
import { ModuleEntity } from '../modules/modules.entity';

@Entity('tbl_tenant_module')
@Unique(['tenantId', 'moduleId'])
export class TenantModule extends AuditEntity {
  @PrimaryGeneratedColumn({ name: 'tenant_module_id', type: 'bigint' }) tenantModuleId!: number;
  @Column({ name: 'tenant_id', type: 'bigint' }) tenantId!: number;
  @Column({ name: 'module_id', type: 'bigint' }) moduleId!: number;
  @Column({ name: 'is_enabled', default: true }) isEnabled!: boolean;
  @ManyToOne(() => Tenant, (tenant) => tenant.tenantModules, { nullable: false }) @JoinColumn({ name: 'tenant_id' }) tenant!: Tenant;
  @ManyToOne(() => ModuleEntity, (module) => module.tenantModules, { nullable: false }) @JoinColumn({ name: 'module_id' }) module!: ModuleEntity;
}
