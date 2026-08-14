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
