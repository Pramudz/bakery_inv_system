import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PlatformUser } from '../platform-users/platform-users.entity';
import { PlatformUsersService } from '../platform-users/platform-users.service';
import { PlatformSession } from '../platform-sessions/platform-sessions.entity';
import { User } from '../users/user.entity';
import { UserSession } from '../user-sessions/user-sessions.entity';
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
        })),
      expiresAt,
    };
  }
}
