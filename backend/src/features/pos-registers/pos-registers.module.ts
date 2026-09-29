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

@Module({
  imports: [TypeOrmModule.forFeature([PosLocationConfig, PosTerminal, PosTerminalActivation, PosTerminalPairing, PosCashRegister, PosRegisterSession, PosCashierSession, PosCashMovement, PosCashReconciliation, PosCashReconciliationPayment])],
  controllers: [PosRegistersController, PosTerminalPairingController, PosSessionsController, PosCashReconciliationController],
  providers: [PosRegistersService, PosSessionsService, PosCashReconciliationService],
  exports: [PosRegistersService, PosSessionsService, PosCashReconciliationService],
})
export class PosRegistersModule {}
