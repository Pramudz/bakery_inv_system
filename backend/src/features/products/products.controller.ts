import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ProductService } from "./products.service";
import { CreateProductDto } from "./dto/create-products.dto";
import { UpdateProductDto } from "./dto/update-products.dto";
import { CurrentUser } from "../auth/current-user.decorator";
import { TenantAuthGuard } from "../auth/tenant-auth.guard";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantPrincipal as AuthPrincipal } from "../auth/auth.types";
import { AddProductImageDto, UpdateProductImageDto } from '../product-images/dto/product-image.dto';
import { PublishSellingPricesDto } from './dto/publish-selling-prices.dto';
import { PublishSupplierPurchasePricesDto } from './dto/publish-supplier-purchase-prices.dto';
import { UpdateProductAttributesDto, UpdateProductGeneralDto, UpdateProductIdentifiersDto, UpdateProductLocationsDto, UpdateProductSupplierLinksDto, UpdateProductUnitsDto } from './dto/update-product-sections.dto';

@Controller("products")
@UseGuards(TenantAuthGuard, PermissionGuard)
export class ProductController {
  constructor(private readonly service: ProductService) {}

  @Get()
  @RequirePermission("PRODUCT_VIEW")
  findAll(
    @CurrentUser() user: AuthPrincipal,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
  ) {
    if (!page && !limit && search === undefined && status === undefined)
      return this.service.findAll(user.tenantId);
    return this.service.findPage(
      user.tenantId,
      Number(page || 1),
      Number(limit || 20),
      search || "",
      status || "",
    );
  }

  @Get(":id")
  @RequirePermission("PRODUCT_VIEW")
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.findOne(id, user.tenantId);
  }

  @Get(":id/images")
  @RequirePermission("PRODUCT_VIEW")
  listImages(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.listImages(id, user.tenantId);
  }

  @Post(":id/images")
  @RequirePermission("PRODUCT_UPDATE")
  addImage(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AddProductImageDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.addImage(id, dto, user.tenantId);
  }

  @Patch(":id/images/:imageId")
  @RequirePermission("PRODUCT_UPDATE")
  updateImage(
    @Param("id", ParseIntPipe) id: number,
    @Param("imageId", ParseIntPipe) imageId: number,
    @Body() dto: UpdateProductImageDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.updateImage(id, imageId, dto, user.tenantId);
  }

  @Patch(":id/images/:imageId/deactivate")
  @RequirePermission("PRODUCT_UPDATE")
  deactivateImage(
    @Param("id", ParseIntPipe) id: number,
    @Param("imageId", ParseIntPipe) imageId: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.deactivateImage(id, imageId, user.tenantId);
  }

  @Get(":id/prices/selling/:priceId/deletion-check")
  @RequirePermission("PRODUCT_UPDATE")
  checkSellingPriceDeletion(
    @Param("id", ParseIntPipe) id: number,
    @Param("priceId", ParseIntPipe) priceId: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.checkSellingPriceDeletion(id, priceId, user.tenantId);
  }

  @Get(":id/selling-prices/summary")
  @RequirePermission("PRODUCT_VIEW")
  sellingPriceSummary(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.getSellingPriceSummary(id, user.tenantId);
  }

  @Get(":id/selling-prices/history")
  @RequirePermission("PRODUCT_VIEW")
  sellingPriceHistory(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
    @Query() query: Record<string, string>,
  ) {
    return this.service.getSellingPriceHistory(id, user.tenantId, query);
  }

  @Post(":id/selling-prices/publish")
  @RequirePermission("PRODUCT_UPDATE")
  publishSellingPrices(@Param("id", ParseIntPipe) id: number, @Body() dto: PublishSellingPricesDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.publishSellingPrices(id, dto, user.tenantId);
  }

  @Patch(":id/general")
  @RequirePermission("PRODUCT_UPDATE")
  updateGeneral(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductGeneralDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.updateGeneral(id, dto, user.tenantId);
  }

  @Put(":id/units")
  @RequirePermission("PRODUCT_UPDATE")
  updateUnits(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductUnitsDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.updateUnits(id, dto.units, user.tenantId);
  }

  @Put(":id/identifiers")
  @RequirePermission("PRODUCT_UPDATE")
  updateIdentifiers(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductIdentifiersDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.updateIdentifiers(id, dto.identifiers, user.tenantId);
  }

  @Put(":id/locations")
  @RequirePermission("PRODUCT_UPDATE")
  updateLocations(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductLocationsDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.updateLocations(id, dto.locations, user.tenantId);
  }

  @Put(":id/attributes")
  @RequirePermission("PRODUCT_UPDATE")
  updateAttributes(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductAttributesDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.updateAttributes(id, dto.attributes, user.tenantId);
  }

  @Put(":id/suppliers")
  @RequirePermission("PRODUCT_UPDATE")
  updateSuppliers(@Param("id", ParseIntPipe) id: number, @Body() dto: UpdateProductSupplierLinksDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.updateSupplierLinks(id, dto.suppliers, user.tenantId);
  }

  @Post(":id/supplier-prices/publish")
  @RequirePermission("PRODUCT_UPDATE")
  publishSupplierPrices(@Param("id", ParseIntPipe) id: number, @Body() dto: PublishSupplierPurchasePricesDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.publishSupplierPurchasePrices(id, dto, user.tenantId);
  }

  @Get(":id/supplier-prices/summary")
  @RequirePermission("PRODUCT_VIEW")
  supplierPriceSummary(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal) {
    return this.service.getSupplierPurchasePriceSummary(id, user.tenantId);
  }

  @Get(":id/supplier-prices/history")
  @RequirePermission("PRODUCT_VIEW")
  supplierPriceHistory(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthPrincipal, @Query() query: Record<string, string>) {
    return this.service.getSupplierPurchasePriceHistory(id, user.tenantId, query);
  }

  @Get(":id/prices/supplier/:priceId/deletion-check")
  @RequirePermission("PRODUCT_UPDATE")
  checkSupplierPriceDeletion(
    @Param("id", ParseIntPipe) id: number,
    @Param("priceId", ParseIntPipe) priceId: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.checkSupplierPriceDeletion(id, priceId, user.tenantId);
  }

  @Post()
  @RequirePermission("PRODUCT_CREATE")
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.create(dto, user);
  }

  @Put(":id")
  @RequirePermission("PRODUCT_UPDATE")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.update(id, dto, user);
  }

  @Patch(":id/deactivate")
  @RequirePermission("PRODUCT_DEACTIVATE")
  deactivate(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.deactivate(id, user.tenantId);
  }

  @Patch(":id/activate")
  @RequirePermission("PRODUCT_DEACTIVATE")
  activate(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.activate(id, user.tenantId);
  }
}
