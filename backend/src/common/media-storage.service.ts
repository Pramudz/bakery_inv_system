import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class MediaStorageService {
  readonly tenantLogoDirectory = join(process.cwd(), 'uploads', 'tenant-logos');

  async replaceTenantLogo(currentUrl: string | null, file: { buffer: Buffer; originalname: string }) {
    const extension = this.detectImageExtension(file.buffer);
    await mkdir(this.tenantLogoDirectory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    await writeFile(join(this.tenantLogoDirectory, filename), file.buffer);
    await this.removeTenantLogo(currentUrl);
    return `/api/media/tenant-logos/${filename}`;
  }

  async removeTenantLogo(url: string | null) {
    if (!url) return;
    const filename = url.split('/').pop();
    if (!filename || filename !== filename.replace(/[^a-zA-Z0-9._-]/g, '')) return;
    await unlink(join(this.tenantLogoDirectory, filename)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  private detectImageExtension(buffer: Buffer) {
    if (buffer.length > 2 * 1024 * 1024) throw new BadRequestException('Logo cannot be larger than 2MB.');
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
    throw new BadRequestException('Logo content must be a PNG, JPG, JPEG, or WEBP image.');
  }
}
