import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductIdentifier } from './product-identifiers.entity';
import { ProductIdentifierController } from './product-identifiers.controller';
import { ProductIdentifierService } from './product-identifiers.service';
@Module({imports:[TypeOrmModule.forFeature([ProductIdentifier])],controllers:[ProductIdentifierController],providers:[ProductIdentifierService],exports:[ProductIdentifierService]})
export class ProductIdentifierModule {}
