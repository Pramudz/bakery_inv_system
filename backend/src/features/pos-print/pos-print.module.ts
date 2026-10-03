import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosPrintAdminController, PosPrintAgentController, PosPrintDocumentController } from './pos-print.controller';
import { PosPrintJob } from './pos-print-job.entity';
import { PosPrintProfile } from './pos-print-profile.entity';
import { PosPrintService } from './pos-print.service';

@Module({ imports: [TypeOrmModule.forFeature([PosPrintProfile, PosPrintJob])], controllers: [PosPrintAdminController, PosPrintAgentController, PosPrintDocumentController], providers: [PosPrintService], exports: [PosPrintService] })
export class PosPrintModule {}
