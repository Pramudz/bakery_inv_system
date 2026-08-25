import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { UserSession } from '../user-sessions/user-sessions.entity';
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(UserSession)
    private readonly userSessionRepository: Repository<UserSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await this.userSessionRepository.findOne({
      where: { sessionTokenHash: tokenHash },
      relations: { user: { tenant: true, userRoles: { role: true }, userLocations: { location: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Session has been revoked.');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session has expired.');
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException('User is inactive.');
    }

    if (!session.user.tenant?.isActive) {
      throw new UnauthorizedException('Tenant is inactive.');
    }

    session.lastActivityAt = new Date();
    await this.userSessionRepository.save(session);

    const role = session.user.userRoles.find((userRole) => userRole.role?.isActive)?.role;
    if (!role) throw new UnauthorizedException('User has no active role.');
    const assignedLocationIds = session.user.userLocations.filter((assignment) => assignment.isActive && assignment.location?.isActive).map((assignment) => assignment.locationId);
    if (role.accessScope === 'LOCATION' && !assignedLocationIds.length) throw new UnauthorizedException('Location-based user has no active location assignment.');
    request.user = {
      scope: 'TENANT',
      userId: session.user.userId,
      tenantId: session.user.tenantId,
      username: session.user.username,
      roleId: role.roleId,
      roleCode: role.code,
      accessScope: role.accessScope,
      assignedLocationIds,
    };

    return true;
  }
}
