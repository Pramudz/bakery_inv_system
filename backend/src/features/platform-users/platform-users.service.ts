import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { PlatformUser } from './platform-users.entity';

@Injectable()
export class PlatformUsersService {
  constructor(
    @InjectRepository(PlatformUser)
    private readonly platformUserRepository: Repository<PlatformUser>,
  ) {}

  async create(data: {
    username: string;
    email?: string;
    password: string;
    firstName?: string;
    lastName?: string;
    mobile?: string;
  }): Promise<PlatformUser> {
    const passwordHash = await bcrypt.hash(data.password, 12);

    const platformUser = this.platformUserRepository.create({
      username: data.username,
      email: data.email ?? null,
      passwordHash,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      mobile: data.mobile ?? null,
      isActive: true,
    });

    return this.platformUserRepository.save(platformUser);
  }

  async findByUsername(
    username: string,
  ): Promise<PlatformUser | null> {
    return this.platformUserRepository.findOne({
      where: { username },
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
  }

  async findById(
    platformUserId: number,
  ): Promise<PlatformUser | null> {
    return this.platformUserRepository.findOne({
      where: { platformUserId },
    });
  }


async bootstrap(body: {
  username: string;
  email?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
}) {
  const count = await this.platformUserRepository.count();

  if (count > 0) {
    throw new ConflictException(
      'Platform user already exists. Bootstrap is disabled.',
    );
  }

  return this.create(body);
}

}