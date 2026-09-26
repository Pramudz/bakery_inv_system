import { BadRequestException } from '@nestjs/common';

export const TENANT_LOGO_UPLOAD_OPTIONS = {
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (
    _request: unknown,
    file: { mimetype: string; originalname: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const allowed = /^(image\/png|image\/jpeg|image\/webp)$/.test(file.mimetype)
      && /\.(png|jpe?g|webp)$/i.test(file.originalname);
    callback(allowed ? null : new BadRequestException('Logo must be a PNG, JPG, JPEG, or WEBP image.'), allowed);
  },
};
