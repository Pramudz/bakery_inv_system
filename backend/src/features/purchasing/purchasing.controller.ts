import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { PurchasingService } from "./purchasing.service";
import { TenantAuthGuard } from "../auth/tenant-auth.guard";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { TenantPrincipal } from "../auth/auth.types";

@Controller("purchasing")
@UseGuards(TenantAuthGuard, PermissionGuard)
export class PurchasingController {
  constructor(private readonly service: PurchasingService) {}

  @Get("purchase-orders")
  @RequirePermission("PURCHASE_ORDER_VIEW")
  listPurchaseOrders(@CurrentUser() user: TenantPrincipal) {
    return this.service.listPos(user);
  }

  @Get("purchase-orders/:id")
  @RequirePermission("PURCHASE_ORDER_VIEW")
  getPurchaseOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.getPo(id, user);
  }

  @Post("purchase-orders")
  @RequirePermission("PURCHASE_ORDER_CREATE")
  createPurchaseOrder(
    @Body() dto: unknown,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.createPo(dto, user);
  }

  @Put("purchase-orders/:id")
  @RequirePermission("PURCHASE_ORDER_UPDATE")
  updatePurchaseOrder(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: unknown,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.updatePo(id, dto, user);
  }

  @Patch("purchase-orders/:id/approve")
  @RequirePermission("PURCHASE_ORDER_APPROVE")
  approvePurchaseOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.approvePo(id, user);
  }

  @Patch("purchase-orders/:id/cancel")
  @RequirePermission("PURCHASE_ORDER_CANCEL")
  cancelPurchaseOrder(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.cancelPo(id, user);
  }

  @Get("goods-receipts")
  @RequirePermission("GRN_VIEW")
  listGoodsReceipts(@CurrentUser() user: TenantPrincipal) {
    return this.service.listGrns(user);
  }

  @Get("goods-receipts/:id")
  @RequirePermission("GRN_VIEW")
  getGoodsReceipt(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.getGrn(id, user);
  }

  @Post("goods-receipts")
  @RequirePermission("GRN_CREATE")
  createGoodsReceipt(
    @Body() dto: unknown,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.createGrn(dto, user);
  }

  @Put("goods-receipts/:id")
  @RequirePermission("GRN_UPDATE")
  updateGoodsReceipt(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: unknown,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.updateGrn(id, dto, user);
  }

  @Patch("goods-receipts/:id/post")
  @RequirePermission("GRN_POST")
  postGoodsReceipt(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.postGrn(id, user);
  }

  @Patch("goods-receipts/:id/cancel")
  @RequirePermission("GRN_CANCEL")
  cancelGoodsReceipt(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: TenantPrincipal,
  ) {
    return this.service.cancelGrn(id, user);
  }
}
