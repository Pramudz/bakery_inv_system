import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleEntity } from './modules.entity';
import { CreateModuleEntityDto } from './dto/create-modules.dto';
import { UpdateModuleEntityDto } from './dto/update-modules.dto';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
@Injectable()
export class ModuleEntityService {
  constructor(@InjectRepository(ModuleEntity) private readonly repo:Repository<ModuleEntity> ) {}
  findAll() { return this.repo.find({order:{moduleId:'ASC'}}); }
  findEnabledForTenant(tenantId: number) {
    return this.repo.createQueryBuilder('module')
      .innerJoin(TenantModule, 'tenantModule', 'tenantModule.moduleId = module.moduleId')
      .where('tenantModule.tenantId = :tenantId', { tenantId })
      .andWhere('tenantModule.isEnabled = :enabled', { enabled: true })
      .andWhere('module.isActive = :active', { active: true })
      .orderBy('module.displayOrder', 'ASC').addOrderBy('module.moduleId', 'ASC').getMany();
  }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({moduleId:id} as any);
    if(!row) throw new NotFoundException('ModuleEntity not found');
    return row;
  }
  async create(dto:CreateModuleEntityDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateModuleEntityDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
