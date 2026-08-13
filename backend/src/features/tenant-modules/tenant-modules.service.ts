import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantModule } from './tenant-modules.entity';
import { ModuleEntity } from '../modules/modules.entity';

@Injectable()
export class TenantModulesService {
  constructor(
    @InjectRepository(TenantModule) private readonly repo: Repository<TenantModule>,
    @InjectRepository(ModuleEntity) private readonly modules: Repository<ModuleEntity>,
  ) {}

  async findForTenant(tenantId: number) {
    const modules = await this.modules.find({ where: { isActive: true }, order: { displayOrder: 'ASC', moduleId: 'ASC' } });
    const assignments = await this.repo.find({ where: { tenantId }, relations: { module: true } });
    const byModuleId = new Map(assignments.map((assignment) => [Number(assignment.moduleId), assignment]));
    return modules.map((module) => {
      const assignment = byModuleId.get(Number(module.moduleId));
      return { tenantModuleId: assignment?.tenantModuleId ?? null, moduleId: module.moduleId, code: module.code, name: module.name, description: module.description, isEnabled: assignment?.isEnabled ?? false };
    });
  }

  async setEnabled(tenantId: number, moduleId: number, isEnabled: boolean) {
    const module = await this.modules.findOneBy({ moduleId, isActive: true });
    if (!module) throw new NotFoundException('Module not found.');
    let assignment = await this.repo.findOneBy({ tenantId, moduleId });
    if (!assignment) assignment = this.repo.create({ tenantId, moduleId, isEnabled });
    else assignment.isEnabled = isEnabled;
    return this.repo.save(assignment);
  }
}
