import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from './brands.entity';
import { BrandController } from './brands.controller';
import { BrandService } from './brands.service';
@Module({imports:[TypeOrmModule.forFeature([Brand])],controllers:[BrandController],providers:[BrandService],exports:[BrandService]})
export class BrandModule {}
