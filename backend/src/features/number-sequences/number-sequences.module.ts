import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NumberSequence } from './number-sequence.entity';
import { NumberSequencesService } from './number-sequences.service';

@Module({
  imports: [TypeOrmModule.forFeature([NumberSequence])],
  providers: [NumberSequencesService],
  exports: [NumberSequencesService],
})
export class NumberSequencesModule {}