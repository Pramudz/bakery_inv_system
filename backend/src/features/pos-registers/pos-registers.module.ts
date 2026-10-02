import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PosLocationConfig } from './pos-location-config.entity';
import { PosRegistersController, PosTerminalPairingController } from './pos-registers.controller';
import { PosRegistersService } from './pos-registers.service';
import { PosTerminalActivation } from './pos-terminal-activation.entity';
import { PosTerminalPairing } from './pos-terminal-pairing.entity';
import { PosTerminal } from './pos-terminal.entity';
import { PosCashRegister } from './pos-cash-register.entity';
import { PosRegisterSession } from './pos-register-session.entity';
import { PosCashierSession } from './pos-cashier-session.entity';
import { PosSessionsController } from './pos-sessions.controller';
import { PosSessionsService } from './pos-sessions.service';
import { PosCashMovement } from './pos-cash-movement.entity';
import { PosCashReconciliation } from './pos-cash-reconciliation.entity';
import { PosCashReconciliationController } from './pos-cash-reconciliation.controller';
import { PosCashReconciliationService } from './pos-cash-reconciliation.service';
import { PosCashReconciliationPayment } from './pos-cash-reconciliation-payment.entity';
import { PosMasterReconciliation } from './pos-master-reconciliation.entity';
import { PosMasterClosingController } from './pos-master-closing.controller';
import { PosMasterClosingService } from './pos-master-closing.service';
import { PosRegisterManagementController } from './pos-register-management.controller';
import { PosRegisterManagementService } from './pos-register-management.service';

@Module({
  imports: [TypeOrmModule.forFeature([PosLocationConfig, PosTerminal, PosTerminalActivation, PosTerminalPairing, PosCashRegister, PosRegisterSession, PosCashierSession, PosCashMovement, PosCashReconciliation, PosCashReconciliationPayment, PosMasterReconciliation])],
  controllers: [PosRegistersController, PosTerminalPairingController, PosSessionsController, PosCashReconciliationController, PosMasterClosingController, PosRegisterManagementController],
  providers: [PosRegistersService, PosSessionsService, PosCashReconciliationService, PosMasterClosingService, PosRegisterManagementService],
  exports: [PosRegistersService, PosSessionsService, PosCashReconciliationService, PosMasterClosingService, PosRegisterManagementService],
})
export class PosRegistersModule {}
