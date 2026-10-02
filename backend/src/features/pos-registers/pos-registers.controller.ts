import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantPrincipal } from '../auth/auth.types';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { ActivatePosTerminalDto } from './dto/activate-pos-terminal.dto';
import { ConfigurePosLocationDto } from './dto/configure-pos-location.dto';
import { CreatePosTerminalDto } from './dto/create-pos-terminal.dto';
import { ReassignPosTerminalDto } from './dto/reassign-pos-terminal.dto';
import { RevokePosPairingDto } from './dto/revoke-pos-pairing.dto';
import { UpdatePosTerminalDto } from './dto/update-pos-terminal.dto';
import { PosListQueryDto } from './dto/pos-list-query.dto';
import { PosRegistersService } from './pos-registers.service';

@Controller('pos-registers')
@UseGuards(TenantAuthGuard, PermissionGuard)
@RequirePermission('SALES_POS_REGISTER_ADMIN')
export class PosRegistersController {
  constructor(private readonly service: PosRegistersService) {}

  @Get('location-configs') locationConfigs(@Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) { return this.service.locationConfigs(query, user); }
  @Put('locations/:locationId/config') configureLocation(@Param('locationId', ParseIntPipe) locationId: number, @Body() dto: ConfigurePosLocationDto, @CurrentUser() user: TenantPrincipal) { return this.service.configureLocation(locationId, dto, user); }
  @Get('terminals') terminals(@Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) { return this.service.terminals(query, user); }
  @Post('terminals') createTerminal(@Body() dto: CreatePosTerminalDto, @CurrentUser() user: TenantPrincipal) { return this.service.createTerminal(dto, user); }
  @Put('terminals/:id') updateTerminal(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePosTerminalDto, @CurrentUser() user: TenantPrincipal) { return this.service.updateTerminal(id, dto, user); }
  @Patch('terminals/:id/activate') activateTerminal(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.setTerminalActive(id, true, user); }
  @Patch('terminals/:id/deactivate') deactivateTerminal(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.setTerminalActive(id, false, user); }
  @Post('terminals/:id/reassign-location') reassignTerminal(@Param('id', ParseIntPipe) id: number, @Body() dto: ReassignPosTerminalDto, @CurrentUser() user: TenantPrincipal) { return this.service.reassignTerminal(id, dto, user); }
  @Post('terminals/:id/activation-codes') issueActivation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: TenantPrincipal) { return this.service.issueActivation(id, user); }
  @Get('terminals/:id/pairings') pairings(@Param('id', ParseIntPipe) id: number, @Query() query: PosListQueryDto, @CurrentUser() user: TenantPrincipal) { return this.service.pairings(id, query, user); }
  @Post('terminals/:terminalId/pairings/:pairingId/revoke') revokePairing(@Param('terminalId', ParseIntPipe) terminalId: number, @Param('pairingId', ParseIntPipe) pairingId: number, @Body() dto: RevokePosPairingDto, @CurrentUser() user: TenantPrincipal) { return this.service.revokePairing(terminalId, pairingId, dto.reason, user); }
}

@Controller('pos-terminal-pairing')
@UseGuards(TenantAuthGuard)
export class PosTerminalPairingController {
  constructor(private readonly service: PosRegistersService) {}

  @Post('activate') activate(@Body() dto: ActivatePosTerminalDto, @CurrentUser() user: TenantPrincipal) { return this.service.activateBrowser(dto, user); }
  @Get('current') current(@Headers('x-pos-terminal-credential') credential: string | undefined, @CurrentUser() user: TenantPrincipal) { return this.service.currentPairing(credential, user); }
}
