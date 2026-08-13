import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { PlatformUsersService } from './platform-users.service';

import { AuthGuard } from '../auth/auth-guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/auth.types';

@Controller('platform-users')
@UseGuards(AuthGuard)
export class PlatformUsersController {
  constructor(
    private readonly platformUsersService: PlatformUsersService,
  ) {}

  @Post()
  async create(
    @Body()
    body: {
      username: string;
      email?: string;
      password: string;
      firstName?: string;
      lastName?: string;
      mobile?: string;
    },
    @CurrentUser() currentUser: AuthPrincipal,
  ) {
    console.log('Authenticated user:', currentUser);

    const platformUser =
      await this.platformUsersService.create(body);

    return {
      platformUserId: platformUser.platformUserId,
      username: platformUser.username,
      email: platformUser.email,
      firstName: platformUser.firstName,
      lastName: platformUser.lastName,
      mobile: platformUser.mobile,
      isActive: platformUser.isActive,
      createdAt: platformUser.createdAt,
      updatedAt: platformUser.updatedAt,
    };
  }

  @Get(':id')
  async findById(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.platformUsersService.findById(id);
  }
}