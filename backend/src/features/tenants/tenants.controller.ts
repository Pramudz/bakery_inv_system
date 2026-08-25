import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TENANT_LOGO_UPLOAD_OPTIONS } from '../../common/tenant-logo-upload';

import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

import { AuthGuard } from '../auth/auth-guard';
import { PlatformGuard } from '../auth/platform.guard';

@Controller('tenants')
@UseGuards(AuthGuard, PlatformGuard)
export class TenantsController {
  constructor(
    private readonly service: TenantsService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateTenantDto,
  ) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('logo', TENANT_LOGO_UPLOAD_OPTIONS))
  uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file) throw new BadRequestException('Logo file is required.');
    return this.service.setLogo(id, file);
  }

  @Delete(':id/logo')
  removeLogo(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeLogo(id);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deactivate(id);
  }

  @Patch(':id/activate')
  activate(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.activate(id);
  }
}
