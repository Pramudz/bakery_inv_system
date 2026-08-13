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

import { BootstrapDto } from './dto/bootstrap.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
  @InjectRepository(PlatformUser)
  private readonly platformUserRepository: Repository<PlatformUser>,

  @InjectRepository(PlatformSession)
  private readonly platformSessionRepository: Repository<PlatformSession>,

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
}