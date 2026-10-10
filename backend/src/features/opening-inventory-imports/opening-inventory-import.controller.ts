import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { OpeningInventoryImportService } from './opening-inventory-import.service';

@Controller('opening-inventory-imports')
@UseGuards(TenantAuthGuard, PermissionGuard)
export class OpeningInventoryImportController {
  constructor(private readonly service: OpeningInventoryImportService) {}

  private sendXlsx(response: Response, filename: string, buffer: Buffer) {
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }

  @Get('template') @RequirePermission('INVENTORY_ADJUSTMENT_VIEW')
  async template(@Query('sample') sample: string, @Res() response: Response) {
    this.sendXlsx(response, `Opening_Inventory_${sample === 'true' ? 'Sample' : 'Template'}.xlsx`, await this.service.template(sample === 'true'));
  }

  @Get('history') @RequirePermission('INVENTORY_ADJUSTMENT_VIEW')
  history(@CurrentUser() user: TenantPrincipal, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.history(user, page === undefined ? 1 : Number(page), limit === undefined ? 20 : Number(limit));
  }

  @Post('preview') @RequirePermission('INVENTORY_ADJUSTMENT_VIEW', 'INVENTORY_ADJUSTMENT_CREATE')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  preview(@Body('datasetId') datasetId: string | undefined,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @CurrentUser() user: TenantPrincipal) {
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx'))
      throw new BadRequestException('Upload an .xlsx file.');
    return this.service.preview(datasetId ?? '', file.buffer, user);
  }

  @Get(':batchId/validation-report') @RequirePermission('INVENTORY_ADJUSTMENT_VIEW')
  async validationReport(@Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal, @Res() response: Response) {
    this.sendXlsx(response, `Opening_Inventory_Validation_${batchId}.xlsx`, await this.service.validationReport(batchId, user));
  }

  @Get(':batchId/results') @RequirePermission('INVENTORY_ADJUSTMENT_VIEW')
  async results(@Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal, @Res() response: Response) {
    this.sendXlsx(response, `Opening_Inventory_Results_${batchId}.xlsx`, await this.service.results(batchId, user));
  }

  @Get(':batchId') @RequirePermission('INVENTORY_ADJUSTMENT_VIEW')
  get(@Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.get(batchId, user);
  }

  @Post(':batchId/confirm') @RequirePermission('INVENTORY_ADJUSTMENT_CREATE', 'INVENTORY_ADJUSTMENT_POST', 'INVENTORY_OPENING_POST')
  confirm(@Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.confirm(batchId, user);
  }
}
