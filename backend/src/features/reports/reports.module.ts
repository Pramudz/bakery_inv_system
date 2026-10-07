import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportInventoryService } from './report-inventory.service';
import { InventoryAgingModule } from '../inventory-aging/inventory-aging.module';

@Module({
  imports: [InventoryAgingModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportInventoryService],
})
export class ReportsModule {}
