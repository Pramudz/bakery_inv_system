import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSession } from './user-sessions.entity';
import { CreateUserSessionDto } from './dto/create-user-sessions.dto';
import { UpdateUserSessionDto } from './dto/update-user-sessions.dto';
@Injectable()
export class UserSessionService {
  constructor(@InjectRepository(UserSession) private readonly repo:Repository<UserSession> ) {}
  findAll() { return this.repo.find({order:{userSessionId:'ASC'}}); }
  async findOne(id:number) {
    const row=await this.repo.findOneBy({userSessionId:id} as any);
    if(!row) throw new NotFoundException('UserSession not found');
    return row;
  }
  async create(dto:CreateUserSessionDto) {
    return this.repo.save(this.repo.create(dto as any));
  }
  async update(id:number,dto:UpdateUserSessionDto) {
    await this.findOne(id); await this.repo.update(id,dto as any); return this.findOne(id);
  }
  async deactivate(id:number) {
    await this.findOne(id); await this.repo.update(id,{isActive:false} as any); return this.findOne(id);
  }
}
