import { BadRequestException, Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { RequireAnyPermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { PosPrintService } from './pos-print.service';

@Controller('pos-print')
@UseGuards(TenantAuthGuard, PermissionGuard)
@RequirePermission('SALES_POS_REGISTER_ADMIN')
export class PosPrintAdminController {
  constructor(private readonly service: PosPrintService) {}
  @Get('profiles') profiles(@Query('locationId', ParseIntPipe) locationId: number, @CurrentUser() user: TenantPrincipal) { return this.service.profiles(locationId, user); }
  @Get('receipt-readiness') receiptReadiness(@Query('locationId', ParseIntPipe) locationId: number, @CurrentUser() user: TenantPrincipal) { return this.service.receiptReadiness(locationId, user); }
  @Post('profiles') configure(@Body() input: Parameters<PosPrintService['configure']>[0], @CurrentUser() user: TenantPrincipal) { return this.service.configure(input, user); }
  @Post('profiles/:id/rotate-token') rotate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.rotateToken(id, user); }
  @Post('profiles/:id/test') test(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.test(id, user); }
  @Get('jobs') jobs(@Query('locationId', ParseIntPipe) locationId: number, @CurrentUser() user: TenantPrincipal) { return this.service.jobs(locationId, user); }
  @Post('jobs/:id/retry') retry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.retry(id, user); }
}

@Controller('pos-print/documents')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PosPrintDocumentController {
  constructor(private readonly service: PosPrintService) {}
  @Get(':documentType/:sourceId/status')
  @RequireAnyPermission('SALES_BILLING', 'SALES_INVOICE_VIEW', 'SALES_REFUND_CREATE', 'SALES_REFUND_VIEW')
  status(@Param('documentType') documentType: string, @Param('sourceId', ParseIntPipe) sourceId: number, @CurrentUser() user: TenantPrincipal) {
    if (documentType !== 'SALE' && documentType !== 'REFUND') throw new BadRequestException('Unsupported receipt document type.');
    return this.service.documentStatus(documentType, sourceId, user);
  }
}

@Controller('pos-print/agent')
export class PosPrintAgentController {
  constructor(private readonly service: PosPrintService) {}
  @Post(':profileId/claim') claim(@Param('profileId', ParseIntPipe) profileId: number, @Headers('x-pos-print-agent-token') token: string | undefined) { return this.service.claim(profileId, token); }
  @Post(':profileId/jobs/:jobId/complete') complete(@Param('profileId', ParseIntPipe) profileId: number, @Param('jobId', ParseIntPipe) jobId: number, @Headers('x-pos-print-agent-token') token: string | undefined, @Body() body: { attempt: number; success: boolean; error?: string }) { return this.service.complete(profileId, jobId, token, body.attempt, body.success, body.error); }
}
