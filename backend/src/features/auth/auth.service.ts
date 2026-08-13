import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  const session =
    this.platformSessionRepository.create({
      platformUserId: platformUser.platformUserId,
      sessionTokenHash,
      expiresAt,
      lastActivityAt: new Date(),
      revokedAt: null,
    });

  await this.platformSessionRepository.save(session);

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
        tenant: { tenantCode: dto.tenantCode },
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

    if (!user.tenant?.tenantIsActive) {
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

    const session = this.userSessionRepository.create({
      userId: user.userId,
      sessionTokenHash,
      expiresAt,
      lastActivityAt: now,
      revokedAt: null,
    });

    await this.userSessionRepository.save(session);
    await this.userRepository.update(user.userId, { lastLoginAt: now });

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

    return {
      accessToken: sessionToken,
      scope: 'TENANT',
      tenant: {
        tenantId: user.tenant.tenantId,
        tenantCode: user.tenant.tenantCode,
        tenantName: user.tenant.tenantName,
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
