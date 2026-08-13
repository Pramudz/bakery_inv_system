import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import {
  AuthenticatedRequest,
} from './auth.types';

@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Authenticated user is required.',
      );
    }

    if (user.scope !== 'PLATFORM') {
      throw new ForbiddenException(
        'Platform access is required.',
      );
    }

    return true;
  }
}