import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal as AuthPrincipal } from '../auth/auth.types';

@Controller('tenant')
@UseGuards(TenantAuthGuard)
export class TenantSelfController {
  constructor(
    @InjectRepository(Tenant)
    private readonly repo: Repository<Tenant>,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthPrincipal) {
    return this.repo.findOne({
      where: { tenantId: user.tenantId },
    });
  }
}
