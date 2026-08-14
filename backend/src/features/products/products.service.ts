import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Repository } from "typeorm";

import { Product } from "./products.entity";
import { CreateProductDto } from "./dto/create-products.dto";
import { UpdateProductDto } from "./dto/update-products.dto";
import { Category } from "../categories/categories.entity";
import { Brand } from "../brands/brands.entity";
import { UnitOfMeasure } from "../units/units.entity";
import { NumberSequencesService } from "../number-sequences/number-sequences.service";
import { ProductUnit } from "../product-units/product-units.entity";
import { ProductIdentifier } from "../product-identifiers/product-identifiers.entity";
import { IdentifierType } from "../identifier-types/identifier-types.entity";
import { ProductSupplier } from "../product-suppliers/product-suppliers.entity";
import { ProductSupplierPrice } from "../product-supplier-prices/product-supplier-price.entity";
import { Supplier } from "../suppliers/suppliers.entity";
import { ProductLocation } from "../product-locations/product-locations.entity";
import { Location } from "../locations/locations.entity";
import { ProductAttributes } from "../product-attributes/product-attributes.entity";
import { Attribute } from "../attributes/attributes.entity";
import { PriceListItem } from "../price-list-items/price-list-items.entity";
import { PriceList } from "../price-lists/price-lists.entity";
import { TenantPrincipal } from "../auth/auth.types";

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly numberSequencesService: NumberSequencesService,
  ) {}

  findAll(tenantId: number) {
    return this.repo.find({
      where: { tenantId },
      relations: {
        tenant: true,
        category: true,
        brand: true,
        baseUnit: true,
      },
      order: { productId: "ASC" },
    });
  }

  async findPage(
    tenantId: number,
    page: number,
    limit: number,
    search: string,
    status: string,
  ) {
    const safePage = Math.max(1, Number.isFinite(page) ? page : 1);
    const safeLimit = [20, 50, 100].includes(limit) ? limit : 20;
    const query = this.repo
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.category", "category")
      .leftJoinAndSelect("product.baseUnit", "baseUnit")
      .where("product.tenantId = :tenantId", { tenantId });
    if (search.trim())
      query.andWhere(
        "(product.sku LIKE :search OR product.productName LIKE :search)",
        { search: `%${search.trim()}%` },
      );
    if (status === "active")
      query.andWhere("product.isActive = :active", { active: true });
    if (status === "inactive")
      query.andWhere("product.isActive = :active", { active: false });
    const [items, total] = await query
      .orderBy("product.productId", "ASC")
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit)
      .getManyAndCount();
    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  async findOne(id: number, tenantId: number) {
    const row = await this.repo.findOne({
      where: { productId: id, tenantId },
      relations: {
        tenant: true,
        category: true,
        brand: true,
        baseUnit: true,
        productUnits: { unit: true },
        identifiers: { identifierType: true },
        productLocations: { location: true },
        productAttributes: { attribute: true },
        productSuppliers: {
          supplier: true,
          purchaseUnit: true,
          prices: { productUnit: { unit: true } },
        },
        priceListItems: { priceList: true, unit: true },
      },
    });

    if (!row) {
      throw new NotFoundException("Product not found");
    }

    return row;
  }

  private async validateReferences(
    dto: Partial<CreateProductDto>,
    tenantId: number,
    manager: EntityManager,
  ) {
    if (dto.categoryId !== undefined) {
      const category = await manager.getRepository(Category).findOne({
        where: {
          categoryId: dto.categoryId,
          tenantId,
        },
      });

      if (!category) {
        throw new NotFoundException("Category not found for this tenant.");
      }
    }

    if (dto.baseUnitId !== undefined) {
      const unit = await manager.getRepository(UnitOfMeasure).findOne({
        where: {
          unitId: dto.baseUnitId,
          tenantId,
        },
      });

      if (!unit) {
        throw new NotFoundException("Base unit not found for this tenant.");
      }
    }

    if (dto.brandId !== undefined && dto.brandId !== null) {
      const brand = await manager.getRepository(Brand).findOne({
        where: {
          brandId: dto.brandId,
          tenantId,
        },
      });

      if (!brand) {
        throw new NotFoundException("Brand not found for this tenant.");
      }
    }
  }

  async create(dto: CreateProductDto, user: TenantPrincipal) {
    const tenantId = user.tenantId;
    return this.dataSource.transaction(async (manager) => {
      await this.validateReferences(dto, tenantId, manager);
      await this.validateAggregateReferences(dto, user, manager);
      this.validateRequiredSetup(dto);

      const nextNumber = await this.numberSequencesService.getNextNumber(
        manager,
        tenantId,
        "SKU",
      );

      const sku = `SKU-${nextNumber.toString().padStart(6, "0")}`;

      const {
        productUnits = [],
        identifiers = [],
        supplierPrices = [],
        locations = [],
        productAttributes = [],
        prices = [],
        ...productData
      } = dto;
      const product = manager.create(Product, {
        ...productData,
        tenantId,
        sku,
      });
      const savedProduct = await manager.save(product);

      const productUnitIds = new Map<number, number>();
      for (const row of productUnits) {
        const saved = await manager.getRepository(ProductUnit).save(
          manager.getRepository(ProductUnit).create({
            ...row,
            productId: savedProduct.productId,
            conversionFactor: String(row.conversionFactor),
          }),
        );
        productUnitIds.set(Number(row.unitId), Number(saved.productUnitId));
      }

      for (const row of identifiers) {
        await manager.getRepository(ProductIdentifier).save(
          manager.getRepository(ProductIdentifier).create({
            ...row,
            productId: savedProduct.productId,
          }),
        );
      }

      const productSupplierIds = new Map<number, number>();
      for (const row of supplierPrices) {
        let productSupplierId = productSupplierIds.get(Number(row.supplierId));
        if (!productSupplierId) {
          const purchaseUnitId = productUnitIds.get(Number(row.unitId));
          if (!purchaseUnitId) {
            throw new BadRequestException(
              "Invalid product unit for supplier price.",
            );
          }
          const savedSupplier = await manager
            .getRepository(ProductSupplier)
            .save(
              manager.getRepository(ProductSupplier).create({
                productId: savedProduct.productId,
                supplierId: Number(row.supplierId),
                purchaseUnitId,
                isPrimarySupplier: false,
              }),
            );
          productSupplierId = Number(savedSupplier.productSupplierId);
          productSupplierIds.set(Number(row.supplierId), productSupplierId);
        }
        await manager.getRepository(ProductSupplierPrice).save(
          manager.getRepository(ProductSupplierPrice).create({
            productSupplierId,
            productUnitId: productUnitIds.get(Number(row.unitId))!,
            purchasePrice: String(row.purchasePrice),
            currencyCode: row.currencyCode || "LKR",
            minimumQuantity: String(row.minimumQuantity),
            effectiveFrom: new Date(row.effectiveFrom),
          }),
        );
      }

      for (const row of locations) {
        await manager.getRepository(ProductLocation).save(
          manager.getRepository(ProductLocation).create({
            ...row,
            productId: savedProduct.productId,
          }),
        );
      }

      for (const row of productAttributes) {
        await manager.getRepository(ProductAttributes).save(
          manager.getRepository(ProductAttributes).create({
            ...row,
            productId: savedProduct.productId,
          }),
        );
      }

      for (const row of prices) {
        await manager.getRepository(PriceListItem).save(
          manager.getRepository(PriceListItem).create({
            ...row,
            productId: savedProduct.productId,
            sellingPrice: String(row.sellingPrice),
            minimumQuantity: String(row.minimumQuantity),
            effectiveFrom: new Date(row.effectiveFrom),
          }),
        );
      }

      return savedProduct;
    });
  }

  private async validateAggregateReferences(
    dto: CreateProductDto | UpdateProductDto,
    user: TenantPrincipal,
    manager: EntityManager,
  ) {
    const unitIds = [
      ...(dto.productUnits ?? []).map((row) => Number(row.unitId)),
      ...(dto.prices ?? []).map((row) => Number(row.unitId)),
    ];
    await this.assertTenantReferences(
      manager,
      UnitOfMeasure,
      "unitId",
      unitIds,
      user.tenantId,
      "Selected unit does not belong to this tenant.",
    );
    await this.assertTenantReferences(
      manager,
      Supplier,
      "supplierId",
      (dto.supplierPrices ?? []).map((row) => Number(row.supplierId)),
      user.tenantId,
      "Selected supplier does not belong to this tenant.",
    );
    await this.assertTenantReferences(
      manager,
      Location,
      "locationId",
      (dto.locations ?? []).map((row) => Number(row.locationId)),
      user.tenantId,
      "Selected location does not belong to this tenant.",
    );
    await this.assertTenantReferences(
      manager,
      Attribute,
      "attributeId",
      (dto.productAttributes ?? []).map((row) => Number(row.attributeId)),
      user.tenantId,
      "Selected attribute does not belong to this tenant.",
    );
    await this.assertTenantReferences(
      manager,
      PriceList,
      "priceListId",
      (dto.prices ?? []).map((row) => Number(row.priceListId)),
      user.tenantId,
      "Selected price list does not belong to this tenant.",
    );

    const identifierTypeIds = [
      ...new Set(
        (dto.identifiers ?? []).map((row) => Number(row.identifierTypeId)),
      ),
    ];
    if (identifierTypeIds.length) {
      const count = await manager
        .getRepository(IdentifierType)
        .countBy({ identifierTypeId: In(identifierTypeIds), isActive: true });
      if (count !== identifierTypeIds.length)
        throw new NotFoundException("Selected identifier type is invalid.");
    }

    if (user.accessScope === "LOCATION") {
      const allowed = new Set(user.assignedLocationIds.map(Number));
      if (
        (dto.locations ?? []).some(
          (row) => !allowed.has(Number(row.locationId)),
        )
      )
        throw new ForbiddenException(
          "User is not assigned to the selected location.",
        );
    }

    this.assertNoDuplicates(
      (dto.productUnits ?? []).map((row) => row.unitId),
      "Duplicate product unit.",
    );
    this.assertNoDuplicates(
      (dto.identifiers ?? []).map((row) =>
        row.identifierValue.trim().toLowerCase(),
      ),
      "Duplicate product identifier.",
    );
    this.assertNoDuplicates(
      (dto.locations ?? []).map((row) => row.locationId),
      "Duplicate product location.",
    );
    this.assertNoDuplicates(
      (dto.productAttributes ?? []).map((row) => row.attributeId),
      "Duplicate product attribute.",
    );
    this.assertNoDuplicates(
      (dto.prices ?? []).map((row) => `${row.priceListId}:${row.unitId}`),
      "Duplicate price list item.",
    );
    this.assertNoDuplicates(
      (dto.supplierPrices ?? []).map(
        (row) => `${row.supplierId}:${row.unitId}`,
      ),
      "Duplicate supplier price.",
    );
    this.assertNoDuplicates(
      (dto.supplierPrices ?? []).map((row) => row.supplierId),
      "Duplicate product supplier.",
    );

    const productUnitIds = new Set(
      (dto.productUnits ?? []).map((row) => Number(row.unitId)),
    );
    if (
      (dto.supplierPrices ?? []).some(
        (row) => !productUnitIds.has(Number(row.unitId)),
      )
    )
      throw new BadRequestException("Invalid product unit for supplier price.");
  }

  private async assertTenantReferences(
    manager: EntityManager,
    entity: any,
    idField: string,
    ids: number[],
    tenantId: number,
    message: string,
  ) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) return;
    const count = await manager.getRepository(entity).count({
      where: { [idField]: In(uniqueIds), tenantId, isActive: true },
    });
    if (count !== uniqueIds.length) throw new NotFoundException(message);
  }

  private assertNoDuplicates(values: Array<string | number>, message: string) {
    if (new Set(values).size !== values.length)
      throw new BadRequestException(message);
  }

  private validateRequiredSetup(dto: CreateProductDto | UpdateProductDto) {
    if (!(dto.productUnits ?? []).length)
      throw new BadRequestException("At least one product unit is required.");
    if (!(dto.prices ?? []).some((row) => Number(row.sellingPrice) > 0))
      throw new BadRequestException("At least one selling price is required.");
    if (
      !(dto.supplierPrices ?? []).some((row) => Number(row.purchasePrice) > 0)
    )
      throw new BadRequestException(
        "At least one supplier purchase price is required.",
      );
    if (!(dto.locations ?? []).length)
      throw new BadRequestException("At least one location is required.");
  }

  async update(id: number, dto: UpdateProductDto, user: TenantPrincipal) {
    const tenantId = user.tenantId;
    return this.dataSource.transaction(async (manager) => {
      const product = await manager
        .getRepository(Product)
        .findOneBy({ productId: id, tenantId });
      if (!product) throw new NotFoundException("Product not found");
      await this.validateReferences(dto, tenantId, manager);
      await this.validateAggregateReferences(dto, user, manager);
      this.validateRequiredSetup(dto);
      if (dto.sku) {
        const duplicate = await manager
          .getRepository(Product)
          .findOneBy({ tenantId, sku: dto.sku });
        if (duplicate && Number(duplicate.productId) !== id)
          throw new BadRequestException("Product code already exists.");
      }
      const {
        productUnits = [],
        identifiers = [],
        supplierPrices = [],
        locations = [],
        productAttributes = [],
        prices = [],
        ...header
      } = dto;
      Object.assign(product, header);
      await manager.save(product);

      const supplierLinks = await manager
        .getRepository(ProductSupplier)
        .findBy({ productId: id });
      if (supplierLinks.length)
        await manager.getRepository(ProductSupplierPrice).delete({
          productSupplierId: In(
            supplierLinks.map((row) => row.productSupplierId),
          ),
        });
      await manager.getRepository(ProductSupplier).delete({ productId: id });
      await manager.getRepository(PriceListItem).delete({ productId: id });
      await manager.getRepository(ProductIdentifier).delete({ productId: id });
      await manager.getRepository(ProductLocation).delete({ productId: id });
      await manager.getRepository(ProductAttributes).delete({ productId: id });
      await manager.getRepository(ProductUnit).delete({ productId: id });

      const unitMap = new Map<number, number>();
      for (const row of productUnits) {
        const saved = await manager.getRepository(ProductUnit).save(
          manager.getRepository(ProductUnit).create({
            ...row,
            productId: id,
            conversionFactor: String(row.conversionFactor),
          }),
        );
        unitMap.set(Number(row.unitId), Number(saved.productUnitId));
      }
      for (const row of identifiers)
        await manager
          .getRepository(ProductIdentifier)
          .save(
            manager
              .getRepository(ProductIdentifier)
              .create({ ...row, productId: id }),
          );
      for (const row of supplierPrices) {
        const productUnitId = unitMap.get(Number(row.unitId));
        if (!productUnitId)
          throw new BadRequestException(
            "Invalid product unit for supplier price.",
          );
        const link = await manager.getRepository(ProductSupplier).save(
          manager.getRepository(ProductSupplier).create({
            productId: id,
            supplierId: row.supplierId,
            purchaseUnitId: productUnitId,
            isPrimarySupplier: false,
          }),
        );
        await manager.getRepository(ProductSupplierPrice).save(
          manager.getRepository(ProductSupplierPrice).create({
            productSupplierId: link.productSupplierId,
            productUnitId,
            purchasePrice: String(row.purchasePrice),
            currencyCode: row.currencyCode || "LKR",
            minimumQuantity: String(row.minimumQuantity),
            effectiveFrom: new Date(row.effectiveFrom),
          }),
        );
      }
      for (const row of locations)
        await manager
          .getRepository(ProductLocation)
          .save(
            manager
              .getRepository(ProductLocation)
              .create({ ...row, productId: id }),
          );
      for (const row of productAttributes)
        await manager
          .getRepository(ProductAttributes)
          .save(
            manager
              .getRepository(ProductAttributes)
              .create({ ...row, productId: id }),
          );
      for (const row of prices)
        await manager.getRepository(PriceListItem).save(
          manager.getRepository(PriceListItem).create({
            ...row,
            productId: id,
            sellingPrice: String(row.sellingPrice),
            minimumQuantity: String(row.minimumQuantity),
            effectiveFrom: new Date(row.effectiveFrom),
          }),
        );
      return product;
    });
  }

  async deactivate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);

    await this.repo.update({ productId: id, tenantId }, { isActive: false });

    return this.findOne(id, tenantId);
  }

  async activate(id: number, tenantId: number) {
    await this.findOne(id, tenantId);
    await this.repo.update({ productId: id, tenantId }, { isActive: true });
    return this.findOne(id, tenantId);
  }
}
