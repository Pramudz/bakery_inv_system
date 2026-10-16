import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PlatformUser } from '../platform-users/platform-users.entity';
import { PlatformUsersService } from '../platform-users/platform-users.service';
import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import { User } from '../users/user.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';
import { UserLocation } from '../user-locations/user-locations.entity';
import { Permission } from '../permissions/permissions.entity';
import { TenantModule } from '../tenant-modules/tenant-modules.entity';
import { RolePermission } from '../role-permissions/role-permissions.entity';
import { TenantLoginDto } from './dto/tenant-login.dto';

import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthPrincipal } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
  @InjectRepository(PlatformUser)
  private readonly platformUserRepository: Repository<PlatformUser>,

  @InjectRepository(PlatformSession)
  private readonly platformSessionRepository: Repository<PlatformSession>,

  @InjectRepository(User)
  private readonly userRepository: Repository<User>,

  @InjectRepository(UserSession)
  private readonly userSessionRepository: Repository<UserSession>,

  @InjectRepository(UserLocation)
  private readonly userLocationRepository: Repository<UserLocation>,

  @InjectRepository(Permission)
  private readonly permissionRepository: Repository<Permission>,

  @InjectRepository(TenantModule)
  private readonly tenantModuleRepository: Repository<TenantModule>,

  private readonly platformUsersService: PlatformUsersService,
) {}

  async changePassword(principal: AuthPrincipal, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New passwords do not match.');
    }
    if (typeof dto.newPassword !== 'string' || dto.newPassword.length < 12 ||
        Buffer.byteLength(dto.newPassword, 'utf8') > 72 || !/[a-z]/.test(dto.newPassword) ||
        !/[A-Z]/.test(dto.newPassword) || !/[0-9]/.test(dto.newPassword) || !/[^A-Za-z0-9]/.test(dto.newPassword)) {
      throw new BadRequestException('Use at least 12 characters with uppercase, lowercase, a number, and a symbol (maximum 72 UTF-8 bytes).');
    }
    // Lock the account so concurrent changes cannot both use the old password.
    // Update credentials and revoke this account's sessions in one transaction.
    return this.platformUserRepository.manager.transaction(async manager => {
      const platform = principal.scope === 'PLATFORM';
      const repository = platform ? manager.getRepository(PlatformUser) : manager.getRepository(User);
      const where = principal.scope === 'PLATFORM'
        ? { platformUserId: principal.platformUserId }
        : { userId: principal.userId, tenantId: principal.tenantId };
      const account = await repository.findOne({
        where, select: { passwordHash: true, isActive: true }, lock: { mode: 'pessimistic_write' },
      });
      if (!account?.isActive) throw new UnauthorizedException('Account is inactive or unavailable.');
      if (!await bcrypt.compare(dto.currentPassword, account.passwordHash)) {
        throw new BadRequestException('Current password is incorrect.');
      }
      if (await bcrypt.compare(dto.newPassword, account.passwordHash)) {
        throw new BadRequestException('Choose a password different from your current password.');
      }
      const passwordHash = await bcrypt.hash(dto.newPassword, 12);
      await repository.update(where, { passwordHash });
      const revokedAt = new Date();
      if (principal.scope === 'PLATFORM') {
        await manager.getRepository(PlatformSession).update(
          { platformUserId: principal.platformUserId, revokedAt: IsNull() }, { revokedAt },
        );
      } else {
        await manager.getRepository(UserSession).update(
          { userId: principal.userId, revokedAt: IsNull() }, { revokedAt },
        );
      }
      return { message: 'Password changed successfully. Please sign in with your new password.' };
    });
  }

  private async issueLoginSession(
    identity: { scope: 'PLATFORM'; platformUserId: number } | { scope: 'TENANT'; userId: number; tenantId: number },
    verifiedPasswordHash: string,
    session: Pick<PlatformSession, 'sessionTokenHash' | 'expiresAt' | 'lastActivityAt' | 'revokedAt'>,
  ) {
    return this.platformUserRepository.manager.transaction(async manager => {
      const accountRepository = identity.scope === 'PLATFORM' ? manager.getRepository(PlatformUser) : manager.getRepository(User);
      const where = identity.scope === 'PLATFORM' ? { platformUserId: identity.platformUserId } : { userId: identity.userId, tenantId: identity.tenantId };
      const account = await accountRepository.findOne({
        where, select: { passwordHash: true, isActive: true }, lock: { mode: 'pessimistic_write' },
      });
      // A password change may have committed after initial credential verification.
      // Session creation shares its account lock so no old-password session survives.
      if (!account?.isActive || account.passwordHash !== verifiedPasswordHash) {
        throw new UnauthorizedException('Account credentials have changed. Please sign in again.');
      }
      if (identity.scope === 'PLATFORM') {
        const sessions = manager.getRepository(PlatformSession);
        await sessions.save(sessions.create({ ...session, platformUserId: identity.platformUserId }));
      } else {
        const sessions = manager.getRepository(UserSession);
        await sessions.save(sessions.create({ ...session, userId: identity.userId }));
        await manager.getRepository(User).update(where, { lastLoginAt: session.lastActivityAt });
      }
    });
  }

  async logout(authorization: string | undefined, scope: 'PLATFORM' | 'TENANT') {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token) throw new UnauthorizedException('Authentication token is required.');
    const sessionTokenHash = createHash('sha256').update(token).digest('hex');
    if (scope === 'PLATFORM') {
      await this.platformSessionRepository.update({ sessionTokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });
    } else {
      await this.userSessionRepository.update({ sessionTokenHash, revokedAt: IsNull() }, { revokedAt: new Date() });
    }
    return { revoked: true };
  }

  async bootstrap(dto: BootstrapDto) {
    const existingUser =
      await this.platformUserRepository.count();

    if (existingUser > 0) {
      throw new ConflictException(
        'Platform has already been initialized.',
      );
    }

    const platformUser =
      await this.platformUsersService.create({
        username: dto.username,
        email: dto.email,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        mobile: dto.mobile,
      });

    return {
      message: 'Platform initialized successfully.',
      platformUser: {
        platformUserId: platformUser.platformUserId,
        username: platformUser.username,
        email: platformUser.email,
        firstName: platformUser.firstName,
        lastName: platformUser.lastName,
        mobile: platformUser.mobile,
        isActive: platformUser.isActive,
      },
    };
  }

  async login(dto: LoginDto) {
  const platformUser =
    await this.platformUserRepository.findOne({
      where: {
        username: dto.username,
      },
      select: {
        platformUserId: true,
        username: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        mobile: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

  if (!platformUser) {
    throw new UnauthorizedException(
      'Invalid username or password.',
    );
  }

  if (!platformUser.isActive) {
    throw new UnauthorizedException(
      'Platform user is inactive.',
    );
  }

  const passwordMatches = await bcrypt.compare(
    dto.password,
    platformUser.passwordHash,
  );

  if (!passwordMatches) {
    throw new UnauthorizedException(
      'Invalid username or password.',
    );
  }

  const sessionToken = randomBytes(32).toString('hex');

  const sessionTokenHash = createHash('sha256')
    .update(sessionToken)
    .digest('hex');

  const expiresAt = new Date(
    Date.now() + 8 * 60 * 60 * 1000,
  );

  await this.issueLoginSession({ scope: 'PLATFORM', platformUserId: platformUser.platformUserId }, platformUser.passwordHash, {
      sessionTokenHash,
      expiresAt,
      lastActivityAt: new Date(),
      revokedAt: null,
    });

  return {
    accessToken: sessionToken,
    scope: 'PLATFORM',

    platformUser: {
      platformUserId: platformUser.platformUserId,
      username: platformUser.username,
      email: platformUser.email,
      firstName: platformUser.firstName,
      lastName: platformUser.lastName,
      mobile: platformUser.mobile,
    },

    expiresAt,
  };
  }

  async tenantLogin(dto: TenantLoginDto) {
    const user = await this.userRepository.findOne({
      where: {
        username: dto.username,
        tenant: { code: dto.tenantCode },
      },
      select: {
        userId: true,
        tenantId: true,
        username: true,
        email: true,
        passwordHash: true,
        firstName: true,
        lastName: true,
        mobile: true,
        isActive: true,
        lastLoginAt: true,
      },
      relations: { tenant: true, userRoles: { role: true } },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid tenant, username or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive.');
    }

    if (!user.tenant?.isActive) {
      throw new UnauthorizedException('Tenant is inactive.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid tenant, username or password.');
    }

    const sessionToken = randomBytes(32).toString('hex');
    const sessionTokenHash = createHash('sha256')
      .update(sessionToken)
      .digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);

    const primaryRole = user.userRoles.find((userRole) => userRole.role?.isActive)?.role;
    if (!primaryRole) throw new UnauthorizedException('User has no active role.');
    const assignedLocations = await this.userLocationRepository.find({
      where: { userId: user.userId, tenantId: user.tenantId, isActive: true },
      relations: { location: true },
      order: { isDefault: 'DESC', userLocationId: 'ASC' },
    });
    if (primaryRole.accessScope === 'LOCATION' && !assignedLocations.length) {
      throw new UnauthorizedException('Location-based user has no active location assignment.');
    }
    const enabledModules = await this.tenantModuleRepository.find({ where: { tenantId: user.tenantId, isEnabled: true }, relations: { module: true } });
    const enabledModuleIds = enabledModules.map((tenantModule) => tenantModule.moduleId);
    const availablePermissions = enabledModuleIds.length ? await this.permissionRepository.find({ where: { moduleId: In(enabledModuleIds), isActive: true } }) : [];
    const rolePermissionCodes = primaryRole.code === 'TENANT_ADMIN'
      ? availablePermissions.map((permission) => permission.code)
      : (await this.userLocationRepository.manager.getRepository(RolePermission).find({ where: { roleId: primaryRole.roleId }, relations: { permission: true } })).map((assignment) => assignment.permission.code).filter((code) => availablePermissions.some((permission) => permission.code === code));

    await this.issueLoginSession({ scope: 'TENANT', userId: user.userId, tenantId: user.tenantId }, user.passwordHash, {
      sessionTokenHash, expiresAt, lastActivityAt: now, revokedAt: null,
    });

    return {
      accessToken: sessionToken,
      scope: 'TENANT',
      tenant: {
        tenantId: user.tenant.tenantId,
        tenantCode: user.tenant.code,
        tenantName: user.tenant.name,
        timeZone: user.tenant.timeZone,
      },
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
      },
      roles: user.userRoles
        .filter((userRole) => userRole.role?.isActive)
        .map((userRole) => ({
          roleId: userRole.role.roleId,
          code: userRole.role.code,
          name: userRole.role.name,
          accessScope: userRole.role.accessScope,
        })),
      role: { roleId: primaryRole.roleId, code: primaryRole.code, name: primaryRole.name, accessScope: primaryRole.accessScope },
      accessScope: primaryRole.accessScope,
      assignedLocations: assignedLocations.map((assignment) => ({ locationId: assignment.locationId, name: assignment.location.name, code: assignment.location.code, isDefault: assignment.isDefault })),
      modules: enabledModules.map((tenantModule) => ({ code: tenantModule.module.code, name: tenantModule.module.name })),
      permissions: rolePermissionCodes,
      expiresAt,
    };
  }
}
