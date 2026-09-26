import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { TenantPrincipal } from '../auth/auth.types';
import { TENANT_LOGO_UPLOAD_OPTIONS } from '../../common/tenant-logo-upload';
import { UpdateMyTenantDto } from './dto/update-my-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller()
@UseGuards(TenantAuthGuard, PermissionGuard)
export class TenantSelfController {
  constructor(private readonly service: TenantsService) {}

  @Get(['my-tenant', 'tenant/me'])
  get(@CurrentUser() user: TenantPrincipal) {
    return this.service.findOne(user.tenantId);
  }

  @Patch('my-tenant')
  @RequirePermission('TENANT_PROFILE_UPDATE')
  update(@Body() dto: UpdateMyTenantDto, @CurrentUser() user: TenantPrincipal) {
    return this.service.updateMyTenant(user.tenantId, dto);
  }

  @Post('my-tenant/logo')
  @RequirePermission('TENANT_PROFILE_UPDATE')
  @UseInterceptors(FileInterceptor('logo', TENANT_LOGO_UPLOAD_OPTIONS))
  uploadLogo(
    @CurrentUser() user: TenantPrincipal,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file) throw new BadRequestException('Logo file is required.');
    return this.service.setLogo(user.tenantId, file);
  }

  @Delete('my-tenant/logo')
  @RequirePermission('TENANT_PROFILE_UPDATE')
  removeLogo(@CurrentUser() user: TenantPrincipal) {
    return this.service.removeLogo(user.tenantId);
  }
}
