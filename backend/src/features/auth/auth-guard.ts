import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from './auth.types';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import { AuthPrincipal } from './auth.types';



@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @InjectRepository(PlatformSession)
    private readonly platformSessionRepository: Repository<PlatformSession>,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization =
      request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException(
        'Authentication token is required.',
      );
    }

    const [scheme, token] =
      authorization.split(' ');

    if (
      scheme !== 'Bearer' ||
      !token
    ) {
      throw new UnauthorizedException(
        'Invalid authentication token.',
      );
    }

    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex');

    const session =
      await this.platformSessionRepository.findOne({
        where: {
          sessionTokenHash: tokenHash,
        },
        relations: {
          platformUser: true,
        },
      });

    if (!session) {
      throw new UnauthorizedException(
        'Invalid authentication token.',
      );
    }

    if (session.revokedAt) {
      throw new UnauthorizedException(
        'Session has been revoked.',
      );
    }

    if (
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(
        'Session has expired.',
      );
    }

    if (!session.platformUser.isActive) {
      throw new UnauthorizedException(
        'Platform user is inactive.',
      );
    }

    session.lastActivityAt = new Date();
    await this.platformSessionRepository.save(session);

    request.user = {
      scope: 'PLATFORM',
      platformUserId:
        session.platformUser.platformUserId,
      username:
        session.platformUser.username,
    };

    return true;
  }
}