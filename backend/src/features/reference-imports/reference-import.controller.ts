import { BadRequestException, Controller, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { IMPORT_SPECS, isMaster, Master } from './reference-import.schema';
import { ReferenceImportPermissionGuard } from './reference-import-permission.guard';
import { ReferenceImportService } from './reference-import.service';

@Controller('reference-imports')
@UseGuards(TenantAuthGuard, ReferenceImportPermissionGuard)
export class ReferenceImportController {
  constructor(private readonly service: ReferenceImportService) {}
  private master(value: string): Master {
    if (!isMaster(value)) throw new BadRequestException('Unknown reference master.');
    return value;
  }
  private sendXlsx(response: Response, filename: string, buffer: Buffer) {
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.send(buffer);
  }

  @Get(':master/template')
  async template(@Param('master') name: string, @Query('sample') sample: string, @Res() response: Response) {
    const master = this.master(name);
    const populated = sample === 'true';
    const buffer = await this.service.template(master, populated);
    this.sendXlsx(response, `${IMPORT_SPECS[master].filename}_${populated ? 'Sample' : 'Template'}.xlsx`, buffer);
  }

  @Post(':master/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  preview(@Param('master') name: string, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @CurrentUser() user: TenantPrincipal) {
    const master = this.master(name);
    if (!file || !file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('Upload an .xlsx file.');
    return this.service.preview(master, user.tenantId, file.buffer);
  }

  @Get(':master/:batchId/results')
  async results(@Param('master') name: string, @Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal, @Res() response: Response) {
    const master = this.master(name);
    const buffer = await this.service.results(master, user.tenantId, batchId);
    this.sendXlsx(response, `${IMPORT_SPECS[master].filename}_Results_${batchId}.xlsx`, buffer);
  }

  @Get(':master/:batchId')
  get(@Param('master') name: string, @Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.get(this.master(name), user.tenantId, batchId);
  }

  @Post(':master/:batchId/confirm')
  confirm(@Param('master') name: string, @Param('batchId', ParseIntPipe) batchId: number, @CurrentUser() user: TenantPrincipal) {
    return this.service.confirm(this.master(name), user.tenantId, batchId);
  }
}
