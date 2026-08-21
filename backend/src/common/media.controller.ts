import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { access } from 'fs/promises';
import { join } from 'path';
import { MediaStorageService } from './media-storage.service';

@Controller('media')
export class MediaController {
  constructor(private readonly storage: MediaStorageService) {}

  @Get('tenant-logos/:filename')
  async tenantLogo(@Param('filename') filename: string, @Res() response: any) {
    if (!/^[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(filename)) throw new NotFoundException();
    const filePath = join(this.storage.tenantLogoDirectory, filename);
    await access(filePath).catch(() => { throw new NotFoundException(); });
    return response.sendFile(filePath);
  }
}
