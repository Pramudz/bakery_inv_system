import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnitOfMeasure } from './units.entity';
import { UnitOfMeasureController } from './units.controller';
import { UnitOfMeasureService } from './units.service';

@Module({
  imports: [TypeOrmModule.forFeature([UnitOfMeasure])],
  controllers: [UnitOfMeasureController],
  providers: [UnitOfMeasureService],
  exports: [UnitOfMeasureService],
})
export class UnitOfMeasureModule {}
