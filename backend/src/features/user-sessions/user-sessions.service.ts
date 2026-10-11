import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserSession } from './user-sessions.entity';

@Injectable()
export class UserSessionService {
  constructor(@InjectRepository(UserSession) private readonly repo: Repository<UserSession>) {}

  private view(row: UserSession) {
    return {
      userSessionId: row.userSessionId,
      userId: row.userId,
      tenantId: row.user?.tenantId,
      username: row.user?.username,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      expiresAt: row.expiresAt,
      lastActivityAt: row.lastActivityAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }

  async findAll() {
    const rows = await this.repo.find({ relations: { user: true }, order: { userSessionId: 'DESC' } });
    return rows.map((row) => this.view(row));
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { userSessionId: id }, relations: { user: true } });
    if (!row) throw new NotFoundException('User session not found.');
    return this.view(row);
  }

  async deactivate(id: number) {
    const row = await this.repo.findOneBy({ userSessionId: id });
    if (!row) throw new NotFoundException('User session not found.');
    if (!row.revokedAt) {
      await this.repo.update({ userSessionId: id, revokedAt: IsNull() }, { revokedAt: new Date() });
    }
    return this.findOne(id);
  }
}
