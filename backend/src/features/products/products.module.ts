import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './products.entity';
import { ProductController } from './products.controller';
import { ProductService } from './products.service';
import { NumberSequencesModule } from '../number-sequences/number-sequences.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    NumberSequencesModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}