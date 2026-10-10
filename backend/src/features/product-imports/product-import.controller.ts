import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { ProductImportPermissionGuard } from './product-import-permission.guard';
import { ProductImportService } from './product-import.service';
import { isProductImportType, ProductImportType } from './product-import.schema';

@Controller('product-imports')
@UseGuards(TenantAuthGuard, ProductImportPermissionGuard)
export class ProductImportController {
  constructor(private readonly service: ProductImportService) {}
  private type(input: string): ProductImportType {
    if (!isProductImportType(input)) throw new BadRequestException('Unknown product import type.');
    return input;
  }
  private sendExcel(response: Response, filename: string, buffer: Buffer) {
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }
  @Get(':type/template')
  async template(@Param('type') name: string, @Query('sample') sample: string, @Res() response: Response) {
    const type = this.type(name);
    this.sendExcel(response, `Product_${type}_${sample === 'true' ? 'Sample' : 'Template'}.xlsx`, await this.service.template(type, sample === 'true'));
  }
  @Get(':type/history')
  history(@Param('type') name: string, @CurrentUser() user: TenantPrincipal,
    @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.service.history(this.type(name), user, page === undefined ? 1 : Number(page), limit === undefined ? 20 : Number(limit));
  }
  @Post(':type/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  preview(@Param('type') name: string, @Body('datasetId') datasetId: string | undefined,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @CurrentUser() user: TenantPrincipal) {
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Upload an .xlsx file.');
    return this.service.preview(this.type(name), datasetId ?? '', file.buffer, user);
  }
  @Get(':type/:batchId/results')
  async results(@Param('type') name: string, @Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal, @Res() response: Response) {
    const type = this.type(name);
    this.sendExcel(response, `Product_${type}_Results_${batchId}.xlsx`, await this.service.results(type, batchId, user));
  }
  @Get(':type/:batchId/validation-report')
  async validationReport(@Param('type') name: string, @Param('batchId', ParseIntPipe) batchId: number,
    @CurrentUser() user: TenantPrincipal, @Res() response: Response) {
    const type = this.type(name);
    this.sendExcel(response, `Product_${type}_Validation_${batchId}.xlsx`, await this.service.validationReport(type, batchId, user));
  }
  @Get(':type/:batchId')
  get(@Param('type') name: string, @Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.get(this.type(name), batchId, user);
  }
  @Post(':type/:batchId/confirm')
  confirm(@Param('type') name: string, @Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.confirm(this.type(name), batchId, user);
  }
}
