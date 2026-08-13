import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSession } from './user-sessions.entity';
import { UserSessionController } from './user-sessions.controller';
import { UserSessionService } from './user-sessions.service';
@Module({imports:[TypeOrmModule.forFeature([UserSession])],controllers:[UserSessionController],providers:[UserSessionService],exports:[UserSessionService]})
export class UserSessionModule {}
