import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, In, Not, Repository } from "typeorm";

import { Product } from "./products.entity";
import { CreateProductDto } from "./dto/create-products.dto";
import { UpdateProductDto } from "./dto/update-products.dto";
import { Category } from "../categories/categories.entity";
import { Brand } from "../brands/brands.entity";
import { UnitOfMeasure } from "../units/units.entity";
import { NumberSequencesService } from "../number-sequences/number-sequences.service";
import { NumberSequenceKeys } from "../number-sequences/number-sequence-keys";
import { formatSku } from "../number-sequences/number-sequence-formatters";
import { ProductUnit } from "../product-units/product-units.entity";
import { ProductIdentifier } from "../product-identifiers/product-identifiers.entity";
import { IdentifierType } from "../identifier-types/identifier-types.entity";
import { ProductSupplier } from "../product-suppliers/product-suppliers.entity";
import { ProductSupplierPrice } from "../product-supplier-prices/product-supplier-price.entity";
import { ProductSupplierUnit } from "../product-supplier-units/product-supplier-unit.entity";
import { Supplier } from "../suppliers/suppliers.entity";
import { ProductLocation } from "../product-locations/product-locations.entity";
import { Location } from "../locations/locations.entity";
import { ProductAttributes } from "../product-attributes/product-attributes.entity";
import { Attribute } from "../attributes/attributes.entity";
import { PriceListItem } from "../price-list-items/price-list-items.entity";
import { PriceList } from "../price-lists/price-lists.entity";
import { TenantPrincipal } from "../auth/auth.types";
import {
  effectivePriceStatus,
  periodsOverlap,
  priceDateEnd,
  priceDateOnly,
  priceDateStart,
} from "./product-price-periods";
import { ProductImage } from "../product-images/product-image.entity";
import {
  AddProductImageDto,
  UpdateProductImageDto,
} from "../product-images/dto/product-image.dto";
import { normalizeProductIdentifier } from "../product-identifiers/product-identifier-normalization";
import { PurchaseOrderLine } from "../purchase-orders/purchase-order-line.entity";
import { GoodsReceiptLine } from "../goods-receipts/goods-receipt-line.entity";
import { InventoryBalance } from "../inventory-balance/inventory-balance.entity";
import { InventoryLedger } from "../inventory-ledger/inventory-ledger.entity";
import { InventoryAgeLayer } from "../inventory-age-layers/inventory-age-layer.entity";
import {
  PublishSellingPricesDto,
  SellingPriceDraftActionDto,
} from "./dto/publish-selling-prices.dto";
import {
  PublishSupplierPurchasePricesDto,
  SupplierPurchasePriceDraftActionDto,
} from "./dto/publish-supplier-purchase-prices.dto";
import {
  ProductSupplierLinkInputDto,
  UpdateProductGeneralDto,
} from "./dto/update-product-sections.dto";

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    private readonly dataSource: DataSource,
    private readonly numberSequencesService: NumberSequencesService,
  ) {}

  async findAll(tenantId: number) {
    const products = await this.repo.find({
      where: { tenantId },
      relations: {
        tenant: true,
        category: true,
        brand: true,
        baseUnit: true,
        productUnits: { unit: true },
        productSuppliers: {
          supplier: true,
          supplierUnits: { productUnit: { unit: true }, prices: true },
        },
        productImages: true,
      },
      order: { productId: "ASC" },
    });
    return products.map((product) => ({
      ...this.withListImages(product),
      productUnits: (product.productUnits ?? []).filter(
        (unit) => unit.isActive,
      ),
      productSuppliers: (product.productSuppliers ?? [])
        .filter((link) => link.isActive)
        .map((link) => ({
          ...link,
          supplierUnits: (link.supplierUnits ?? [])
            .filter((unit) => unit.isActive)
            .map((unit) => ({
              ...unit,
              prices: (unit.prices ?? [])
                .filter((price) => price.isActive)
                .map((price) => ({
                  ...price,
                  effectiveFrom: priceDateOnly(price.effectiveFrom),
                  effectiveTo: priceDateOnly(price.effectiveTo),
                })),
            })),
        })),
    }));
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
      .leftJoinAndSelect("product.brand", "brand")
      .leftJoinAndSelect("product.baseUnit", "baseUnit")
      .leftJoinAndSelect(
        "product.productImages",
        "productImages",
        "productImages.tenantId = product.tenantId AND productImages.isActive = :imageActive AND productImages.isPrimary = :imagePrimary",
        { imageActive: true, imagePrimary: true },
      )
      .where("product.tenantId = :tenantId", { tenantId });
    if (search.trim())
      query.andWhere(
        `(product.sku LIKE :search OR product.productName LIKE :search OR EXISTS (
          SELECT 1 FROM tbl_product_identifier identifier
          WHERE identifier.product_id = product.product_id
            AND identifier.tenant_id = product.tenant_id
            AND identifier.is_active = 1
            AND identifier.normalized_identifier_value LIKE :identifierSearch
        ))`,
        {
          search: `%${search.trim()}%`,
          identifierSearch: `%${search.trim().toUpperCase()}%`,
        },
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
      items: items.map((product) => this.withListImages(product)),
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
        identifiers: { identifierType: true, productUnit: { unit: true } },
        productLocations: { location: true },
        productAttributes: { attribute: true },
        productSuppliers: {
          supplier: true,
          supplierUnits: { productUnit: { unit: true } },
        },
        priceListItems: {
          priceList: true,
          unit: true,
          productUnit: { unit: true },
        },
        productImages: true,
      },
    });

    if (!row) {
      throw new NotFoundException("Product not found");
    }

    return this.withProductUnitUsage(
      this.dataSource.manager,
      this.withPriceStatuses(row),
    );
  }

  private withPriceStatuses(product: Product) {
    const now = new Date();
    const status = (row: {
      isActive: boolean;
      effectiveFrom: Date;
      effectiveTo: Date | null;
    }) => effectivePriceStatus(row, now);
    return {
      ...product,
      priceListItems: (product.priceListItems ?? []).map((row) => ({
        ...row,
        effectiveFrom: priceDateOnly(row.effectiveFrom),
        effectiveTo: priceDateOnly(row.effectiveTo),
        effectiveStatus: status(row),
      })),
      productSuppliers: (product.productSuppliers ?? []).map((link) => ({
        ...link,
        supplierUnits: (link.supplierUnits ?? []).map((unit) => ({
          ...unit,
          prices: (unit.prices ?? []).map((row) => ({
            ...row,
            effectiveFrom: priceDateOnly(row.effectiveFrom),
            effectiveTo: priceDateOnly(row.effectiveTo),
            effectiveStatus: status(row),
          })),
        })),
      })),
      productImages: this.activeSortedImages(
        (product.productImages ?? []).filter(
          (image) => Number(image.tenantId) === Number(product.tenantId),
        ),
      ),
    };
  }

  private withListImages(product: Product) {
    return {
      ...product,
      productImages: this.activeSortedImages(
        (product.productImages ?? []).filter(
          (image) => Number(image.tenantId) === Number(product.tenantId),
        ),
      ).filter((image) => image.isPrimary),
    };
  }

  private activeSortedImages(images: ProductImage[] = []) {
    return images
      .filter((image) => image.isActive)
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.displayOrder - b.displayOrder ||
          Number(a.productImageId) - Number(b.productImageId),
      );
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
        NumberSequenceKeys.SKU,
      );

      const sku = formatSku(nextNumber);

      const {
        productUnits = [],
        identifiers = [],
        supplierLinks = [],
        locations = [],
        productAttributes = [],
        prices = [],
        images = [],
        ...productData
      } = dto;
      const product = manager.create(Product, {
        ...productData,
        tenantId,
        sku,
      });
      let savedProduct: Product;
      try {
        savedProduct = await manager.save(product);
      } catch (error: any) {
        if (
          (error?.code === "ER_DUP_ENTRY" ||
            error?.driverError?.code === "ER_DUP_ENTRY") &&
          String(
            error?.sqlMessage ?? error?.driverError?.sqlMessage ?? "",
          ).includes("uq_product_tenant_sku")
        )
          throw new ConflictException(
            "A product SKU conflict was detected. The SKU sequence must be reconciled before retrying.",
          );
        throw error;
      }

      const productId = Number(savedProduct.productId);
      const unitMap = await this.syncProductUnits(
        manager,
        productId,
        productUnits,
      );
      await this.syncIdentifiers(manager, productId, tenantId, identifiers);
      await this.syncLocations(manager, productId, locations);
      await this.syncAttributes(manager, productId, productAttributes);
      await this.syncSellingPrices(manager, productId, prices, [], tenantId);
      await this.createSupplierAggregate(
        manager,
        productId,
        supplierLinks,
        unitMap,
      );
      await this.syncImages(manager, productId, tenantId, images);
      return this.findOneWithManager(manager, productId, tenantId);
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
      ...("supplierLinks" in dto
        ? (dto.supplierLinks ?? []).flatMap((link) =>
            link.units.map((unit) => Number(unit.unitId)),
          )
        : []),
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
      "supplierLinks" in dto
        ? (dto.supplierLinks ?? []).map((row) => Number(row.supplierId))
        : [],
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
      (dto.prices ?? []).map(
        (row) =>
          `${row.priceListId}:${row.unitId}:${(row.currencyCode || "LKR").toUpperCase()}:1:${new Date(row.effectiveFrom).toISOString()}`,
      ),
      "Duplicate price list item.",
    );
    const nestedSupplierLinks =
      "supplierLinks" in dto ? (dto.supplierLinks ?? []) : [];
    this.assertNoDuplicates(
      nestedSupplierLinks.map((row) => row.supplierId),
      "Duplicate product supplier.",
    );
    if (
      nestedSupplierLinks.filter(
        (row) => row.isActive !== false && row.isPrimarySupplier,
      ).length > 1
    )
      throw new BadRequestException(
        "Only one primary supplier can be selected for a product.",
      );
    for (const link of nestedSupplierLinks) {
      this.assertNoDuplicates(
        link.units.map((unit) => unit.unitId),
        "Duplicate supplier purchase unit.",
      );
      if (
        link.units.filter(
          (unit) => unit.isActive !== false && unit.isDefaultPurchaseUnit,
        ).length > 1
      )
        throw new BadRequestException(
          "A supplier can have only one default active purchase unit.",
        );
      for (const unit of link.units)
        this.assertNoDuplicates(
          unit.prices.map(
            (price) =>
              `${(price.currencyCode || "LKR").toUpperCase()}:1:${new Date(price.effectiveFrom).toISOString()}`,
          ),
          "Duplicate supplier price.",
        );
    }

    const productUnitIds = new Set(
      (dto.productUnits ?? []).map((row) => Number(row.unitId)),
    );
    if (
      nestedSupplierLinks.some((link) =>
        link.units.some((unit) => !productUnitIds.has(Number(unit.unitId))),
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

  private validateRequiredSetup(
    dto: CreateProductDto | UpdateProductDto,
    allowOmittedSellingPrices = false,
  ) {
    if (!(dto.productUnits ?? []).length)
      throw new BadRequestException("At least one product unit is required.");
    const now = new Date();
    const current = (row: {
      isActive?: boolean;
      effectiveFrom: string;
      effectiveTo?: string | null;
    }) =>
      row.isActive !== false &&
      new Date(row.effectiveFrom) <= now &&
      (!row.effectiveTo || new Date(row.effectiveTo) >= now);
    const baseUnit = (dto.productUnits ?? []).find(
      (row) => row.isBaseUnit && row.isActive !== false,
    );
    if (
      dto.isSellable !== false &&
      !(allowOmittedSellingPrices && dto.prices === undefined) &&
      !(dto.prices ?? []).some(
        (row) =>
          current(row) &&
          Number(row.sellingPrice) > 0 &&
          Number(row.unitId) === Number(baseUnit?.unitId),
      )
    )
      throw new BadRequestException("At least one selling price is required.");
    const nestedSupplierLinks =
      "supplierLinks" in dto ? (dto.supplierLinks ?? []) : [];
    if (
      dto.isPurchasable !== false &&
      !(
        nestedSupplierLinks.some((link) => link.isActive !== false) &&
        nestedSupplierLinks.some((link) =>
          link.units.some(
            (unit) =>
              unit.isActive !== false &&
              unit.prices.some(
                (row) => current(row) && Number(row.purchasePrice) > 0,
              ),
          ),
        )
      )
    )
      throw new BadRequestException(
        "At least one supplier purchase price is required.",
      );
    if (
      dto.isPurchasable !== false &&
      !(dto.productUnits ?? []).some(
        (row) => row.isActive !== false && row.isPurchaseUnit,
      )
    )
      throw new BadRequestException(
        "At least one active purchase unit is required for a purchasable product.",
      );
    if (dto.isStockItem !== false && !(dto.locations ?? []).length)
      throw new BadRequestException("At least one location is required.");
  }

  async update(id: number, dto: UpdateProductDto, user: TenantPrincipal) {
    const tenantId = user.tenantId;
    return this.dataSource.transaction(async (manager) => {
      const product = await manager
        .getRepository(Product)
        .findOneBy({ productId: id, tenantId });
      if (!product) throw new NotFoundException("Product not found");
      if (
        dto.baseUnitId !== undefined &&
        Number(dto.baseUnitId) !== Number(product.baseUnitId)
      )
        throw new BadRequestException(
          "Base unit cannot be changed after product creation.",
        );
      await this.validateReferences(dto, tenantId, manager);
      await this.validateAggregateReferences(dto, user, manager);
      this.validateRequiredSetup(dto, true);
      const {
        productUnits = [],
        identifiers = [],
        locations = [],
        productAttributes = [],
        prices,
        images = [],
        removedSellingPriceIds = [],
        ...header
      } = dto;
      Object.assign(product, header);
      await manager.save(product);

      await this.syncProductUnits(manager, id, productUnits);
      await this.syncIdentifiers(manager, id, tenantId, identifiers);
      await this.syncLocations(manager, id, locations);
      await this.syncAttributes(manager, id, productAttributes);
      if (prices !== undefined)
        await this.syncSellingPrices(
          manager,
          id,
          prices,
          removedSellingPriceIds,
          tenantId,
        );
      if (product.isSellable)
        await this.assertCurrentBaseSellingPrice(manager, id, tenantId);
      await this.syncImages(manager, id, tenantId, images);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  async updateGeneral(
    id: number,
    dto: UpdateProductGeneralDto,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.assertProductOwner(manager, id, tenantId);
      if (dto.categoryId !== undefined)
        await this.assertTenantReferences(
          manager,
          Category,
          "categoryId",
          [dto.categoryId],
          tenantId,
          "Selected category does not belong to this tenant.",
        );
      if (dto.brandId != null)
        await this.assertTenantReferences(
          manager,
          Brand,
          "brandId",
          [dto.brandId],
          tenantId,
          "Selected brand does not belong to this tenant.",
        );
      Object.assign(product, dto);
      await manager.getRepository(Product).save(product);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  async updateUnits(
    id: number,
    units: NonNullable<CreateProductDto["productUnits"]>,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, id, tenantId);
      await this.assertTenantReferences(
        manager,
        UnitOfMeasure,
        "unitId",
        units.map((row) => Number(row.unitId)),
        tenantId,
        "Selected unit does not belong to this tenant.",
      );
      await this.syncProductUnits(manager, id, units);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  async updateIdentifiers(
    id: number,
    identifiers: NonNullable<CreateProductDto["identifiers"]>,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, id, tenantId);
      await this.syncIdentifiers(manager, id, tenantId, identifiers);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  async updateLocations(
    id: number,
    locations: NonNullable<CreateProductDto["locations"]>,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, id, tenantId);
      await this.assertTenantReferences(
        manager,
        Location,
        "locationId",
        locations.map((row) => Number(row.locationId)),
        tenantId,
        "Selected location does not belong to this tenant.",
      );
      await this.syncLocations(manager, id, locations);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  async updateAttributes(
    id: number,
    attributes: NonNullable<CreateProductDto["productAttributes"]>,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, id, tenantId);
      await this.assertTenantReferences(
        manager,
        Attribute,
        "attributeId",
        attributes.map((row) => Number(row.attributeId)),
        tenantId,
        "Selected attribute does not belong to this tenant.",
      );
      await this.syncAttributes(manager, id, attributes);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  async updateSupplierLinks(
    id: number,
    suppliers: ProductSupplierLinkInputDto[],
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, id, tenantId);
      await this.assertTenantReferences(
        manager,
        Supplier,
        "supplierId",
        suppliers.map((row) => Number(row.supplierId)),
        tenantId,
        "Selected supplier does not belong to this tenant.",
      );
      await this.syncSupplierLinks(manager, id, suppliers);
      return this.findOneWithManager(manager, id, tenantId);
    });
  }

  private async findOneWithManager(
    manager: EntityManager,
    id: number,
    tenantId: number,
  ) {
    const product = await manager.getRepository(Product).findOneOrFail({
      where: { productId: id, tenantId },
      relations: {
        category: true,
        brand: true,
        baseUnit: true,
        identifiers: { identifierType: true, productUnit: { unit: true } },
        productUnits: { unit: true },
        productLocations: { location: true },
        productAttributes: { attribute: true },
        productSuppliers: {
          supplier: true,
          supplierUnits: { productUnit: { unit: true }, prices: true },
        },
        priceListItems: {
          priceList: true,
          unit: true,
          productUnit: { unit: true },
        },
        productImages: true,
      },
    });
    return this.withProductUnitUsage(manager, this.withPriceStatuses(product));
  }

  private async assertCurrentBaseSellingPrice(
    manager: EntityManager,
    productId: number,
    tenantId: number,
  ) {
    const now = new Date();
    const count = await manager
      .getRepository(PriceListItem)
      .createQueryBuilder("price")
      .innerJoin("price.productUnit", "productUnit")
      .where("price.tenantId = :tenantId AND price.productId = :productId", {
        tenantId,
        productId,
      })
      .andWhere(
        "productUnit.isBaseUnit = 1 AND productUnit.isActive = 1 AND productUnit.isSalesUnit = 1",
      )
      .andWhere("price.isActive = 1 AND price.sellingPrice > 0")
      .andWhere(
        "price.effectiveFrom <= :now AND (price.effectiveTo IS NULL OR price.effectiveTo >= :now)",
        { now },
      )
      .getCount();
    if (!count)
      throw new BadRequestException(
        "A sellable product requires a current selling price for its active base Product Unit.",
      );
  }

  private async productHasTransactionsOrStock(
    manager: EntityManager,
    productId: number,
  ) {
    const [stock, ledger, ageHistory, purchaseHistory, receiptHistory] =
      await Promise.all([
        manager
          .getRepository(InventoryBalance)
          .count({ where: { productId, quantityOnHand: Not("0") } as any }),
        manager.getRepository(InventoryLedger).countBy({ productId }),
        manager.getRepository(InventoryAgeLayer).countBy({ productId }),
        manager.getRepository(PurchaseOrderLine).countBy({ productId }),
        manager.getRepository(GoodsReceiptLine).countBy({ productId }),
      ]);
    return stock + ledger + ageHistory + purchaseHistory + receiptHistory > 0;
  }

  private async productUnitReferenceReason(
    manager: EntityManager,
    productUnitId: number,
  ) {
    const [orders, receipts, supplierUnits, sellingPrices, identifiers] =
      await Promise.all([
        manager.getRepository(PurchaseOrderLine).countBy({ productUnitId }),
        manager.getRepository(GoodsReceiptLine).countBy({ productUnitId }),
        manager.getRepository(ProductSupplierUnit).countBy({ productUnitId }),
        manager.getRepository(PriceListItem).countBy({ productUnitId }),
        manager.getRepository(ProductIdentifier).countBy({ productUnitId }),
      ]);
    if (orders) return "purchase order history";
    if (receipts) return "goods receipt history";
    if (supplierUnits) return "supplier purchasing records";
    if (sellingPrices) return "selling price history";
    if (identifiers) return "product identifiers";
    return null;
  }

  private async withProductUnitUsage(manager: EntityManager, product: any) {
    const baseUnitLocked = await this.productHasTransactionsOrStock(
      manager,
      Number(product.productId),
    );
    const productUnits = await Promise.all(
      (product.productUnits ?? []).map(async (unit: ProductUnit) => {
        const referenceReason = await this.productUnitReferenceReason(
          manager,
          Number(unit.productUnitId),
        );
        return {
          ...unit,
          hasReferences: Boolean(referenceReason),
          referenceReason,
          baseUnitLocked,
        };
      }),
    );
    return { ...product, productUnits, baseUnitLocked };
  }

  private sellingPriceStatus(
    row: Pick<PriceListItem, "isActive" | "effectiveFrom" | "effectiveTo">,
    now = new Date(),
  ) {
    if (!row.isActive || (row.effectiveTo && row.effectiveTo < now))
      return "ENDED" as const;
    if (row.effectiveFrom > now) return "FUTURE" as const;
    return "CURRENT" as const;
  }

  private sellingPriceResponse(row: PriceListItem, now = new Date()) {
    return {
      priceListItemId: Number(row.priceListItemId),
      priceListId: Number(row.priceListId),
      productUnitId: Number(row.productUnitId),
      unitId: Number(row.unitId),
      sellingPrice: row.sellingPrice,
      currencyCode: row.currencyCode,
      minimumQuantity: row.minimumQuantity,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      status: this.sellingPriceStatus(row, now),
      priceList: row.priceList
        ? {
            priceListId: Number(row.priceList.priceListId),
            code: row.priceList.code,
            name: row.priceList.name,
          }
        : undefined,
      productUnit: row.productUnit
        ? {
            productUnitId: Number(row.productUnit.productUnitId),
            unitId: Number(row.productUnit.unitId),
            conversionFactor: row.productUnit.conversionFactor,
            unit: row.productUnit.unit
              ? {
                  unitId: Number(row.productUnit.unit.unitId),
                  code: row.productUnit.unit.code,
                  name: row.productUnit.unit.name,
                }
              : undefined,
          }
        : undefined,
    };
  }

  private async assertProductOwner(
    manager: EntityManager,
    productId: number,
    tenantId: number,
  ) {
    const product = await manager
      .getRepository(Product)
      .findOneBy({ productId, tenantId });
    if (!product) throw new NotFoundException("Product not found.");
    return product;
  }

  async getSellingPriceSummary(
    productId: number,
    tenantId: number,
    manager: EntityManager = this.dataSource.manager,
  ) {
    await this.assertProductOwner(manager, productId, tenantId);
    const now = new Date();
    const rows = await manager.getRepository(PriceListItem).find({
      where: { tenantId, productId },
      relations: { priceList: true, productUnit: { unit: true }, unit: true },
      order: { effectiveFrom: "ASC", priceListItemId: "ASC" },
    });
    const groups = new Map<string, PriceListItem[]>();
    for (const row of rows.filter((item) => item.productUnit?.isBaseUnit)) {
      const key = `${row.priceListId}:${row.productUnitId}:${Number(row.minimumQuantity)}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.values()]
      .map((group) => {
        const working = group.filter((row) => row.isActive);
        const current =
          working
            .filter((row) => this.sellingPriceStatus(row, now) === "CURRENT")
            .sort(
              (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
            )[0] ?? null;
        const nextScheduled =
          working
            .filter((row) => this.sellingPriceStatus(row, now) === "FUTURE")
            .sort(
              (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
            )[0] ?? null;
        const display = current ?? nextScheduled ?? group[group.length - 1];
        return {
          priceListId: Number(display.priceListId),
          productUnitId: Number(display.productUnitId),
          minimumQuantity: Number(display.minimumQuantity),
          priceList: {
            priceListId: Number(display.priceList.priceListId),
            code: display.priceList.code,
            name: display.priceList.name,
          },
          productUnit: this.sellingPriceResponse(display, now).productUnit,
          current: current ? this.sellingPriceResponse(current, now) : null,
          nextScheduled: nextScheduled
            ? this.sellingPriceResponse(nextScheduled, now)
            : null,
          historyCount: group.length,
        };
      })
      .sort((a, b) => a.priceList.name.localeCompare(b.priceList.name));
  }

  async getSellingPriceHistory(
    productId: number,
    tenantId: number,
    query: Record<string, string>,
  ) {
    await this.assertProductOwner(this.dataSource.manager, productId, tenantId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = [25, 50, 100].includes(Number(query.limit))
      ? Number(query.limit)
      : 25;
    const now = new Date();
    const builder = this.dataSource.manager
      .getRepository(PriceListItem)
      .createQueryBuilder("price")
      .leftJoinAndSelect("price.priceList", "priceList")
      .leftJoinAndSelect("price.productUnit", "productUnit")
      .leftJoinAndSelect("productUnit.unit", "unit")
      .where("price.tenantId = :tenantId AND price.productId = :productId", {
        tenantId,
        productId,
      });
    if (query.priceListId)
      builder.andWhere("price.priceListId = :priceListId", {
        priceListId: Number(query.priceListId),
      });
    if (query.productUnitId)
      builder.andWhere("price.productUnitId = :productUnitId", {
        productUnitId: Number(query.productUnitId),
      });
    if (query.fromDate)
      builder.andWhere("price.effectiveFrom >= :fromDate", {
        fromDate: new Date(`${query.fromDate.slice(0, 10)}T00:00:00.000`),
      });
    if (query.toDate)
      builder.andWhere("price.effectiveFrom <= :toDate", {
        toDate: new Date(`${query.toDate.slice(0, 10)}T23:59:59.999`),
      });
    if (query.status === "CURRENT")
      builder.andWhere(
        "price.isActive = 1 AND price.effectiveFrom <= :now AND (price.effectiveTo IS NULL OR price.effectiveTo >= :now)",
        { now },
      );
    if (query.status === "FUTURE")
      builder.andWhere("price.isActive = 1 AND price.effectiveFrom > :now", {
        now,
      });
    if (query.status === "ENDED")
      builder.andWhere("(price.isActive = 0 OR price.effectiveTo < :now)", {
        now,
      });
    const [items, totalItems] = await builder
      .orderBy("price.effectiveFrom", "DESC")
      .addOrderBy("price.priceListItemId", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: items.map((row) => this.sellingPriceResponse(row, now)),
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    };
  }

  private actionDate(value: string | undefined, field: string) {
    if (!value) throw new BadRequestException(`${field} is required.`);
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException(`${field} must be a valid date and time.`);
    return date;
  }

  private async resolveSellingPriceContext(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    action: SellingPriceDraftActionDto,
  ) {
    if (!action.priceListId || !action.productUnitId)
      throw new BadRequestException(
        "Price List and Product Unit are required.",
      );
    const [priceList, productUnit] = await Promise.all([
      manager
        .getRepository(PriceList)
        .findOneBy({
          priceListId: action.priceListId,
          tenantId,
          isActive: true,
        }),
      manager
        .getRepository(ProductUnit)
        .findOne({
          where: {
            productUnitId: action.productUnitId,
            productId,
            isActive: true,
          },
          relations: { unit: true },
        }),
    ]);
    if (!priceList)
      throw new BadRequestException(
        "Price List is not active for this tenant.",
      );
    if (!productUnit)
      throw new BadRequestException(
        "Product Unit is not an active unit for this product. Save Product Unit changes first.",
      );
    if (
      !productUnit.isBaseUnit ||
      !productUnit.isSalesUnit ||
      Number(productUnit.conversionFactor) !== 1
    )
      throw new BadRequestException(
        "Selling prices can only use the active base Product Unit.",
      );
    return { priceList, productUnit };
  }

  private async sellingPriceTarget(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    priceListItemId?: number,
  ) {
    if (!priceListItemId)
      throw new BadRequestException("Selling price revision is required.");
    const target = await manager.getRepository(PriceListItem).findOne({
      where: { priceListItemId, productId, tenantId },
      relations: { priceList: true, productUnit: { unit: true } },
    });
    if (!target)
      throw new BadRequestException(
        "Selling price revision does not belong to this product.",
      );
    return target;
  }

  private async activeSellingPriceContext(
    manager: EntityManager,
    target: Pick<
      PriceListItem,
      | "tenantId"
      | "productId"
      | "priceListId"
      | "productUnitId"
      | "minimumQuantity"
    >,
    now: Date,
  ) {
    const rows = await manager.getRepository(PriceListItem).find({
      where: {
        tenantId: target.tenantId,
        productId: target.productId,
        priceListId: target.priceListId,
        productUnitId: target.productUnitId,
        minimumQuantity: target.minimumQuantity,
        isActive: true,
      },
    });
    return rows
      .filter((row) => !row.effectiveTo || row.effectiveTo >= now)
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  }

  async publishSellingPrices(
    productId: number,
    dto: PublishSellingPricesDto,
    tenantId: number,
  ) {
    if (!dto.actions.length)
      throw new BadRequestException(
        "At least one draft price action is required.",
      );
    await this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, productId, tenantId);
      const targetedIds = dto.actions
        .map((action) => action.priceListItemId)
        .filter((value): value is number => Boolean(value));
      if (new Set(targetedIds).size !== targetedIds.length)
        throw new BadRequestException(
          "A selling price revision cannot have more than one draft action in the same publish batch.",
        );
      for (const action of dto.actions)
        await this.publishSellingPriceAction(
          manager,
          productId,
          tenantId,
          action,
        );
    });
    return this.getSellingPriceSummary(productId, tenantId);
  }

  private async publishSellingPriceAction(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    action: SellingPriceDraftActionDto,
  ) {
    const repo = manager.getRepository(PriceListItem);
    const now = new Date();
    if (action.action === "ADD_INITIAL_PRICE") {
      if (!action.price || action.price <= 0)
        throw new BadRequestException(
          "Selling price must be greater than zero.",
        );
      const { priceList, productUnit } = await this.resolveSellingPriceContext(
        manager,
        productId,
        tenantId,
        action,
      );
      const from =
        action.effectiveMode === "SCHEDULED"
          ? this.actionDate(action.effectiveFrom, "Effective From")
          : now;
      if (action.effectiveMode === "SCHEDULED" && from <= now)
        throw new BadRequestException(
          "A scheduled selling price must start in the future.",
        );
      const context = await this.activeSellingPriceContext(
        manager,
        {
          tenantId,
          productId,
          priceListId: priceList.priceListId,
          productUnitId: productUnit.productUnitId,
          minimumQuantity: "1",
        },
        now,
      );
      if (context.length)
        throw new BadRequestException(
          "A selling price combination already exists. Use Change Price instead.",
        );
      await repo.save(
        repo.create({
          tenantId,
          productId,
          priceListId: priceList.priceListId,
          productUnitId: productUnit.productUnitId,
          unitId: productUnit.unitId,
          sellingPrice: String(action.price),
          currencyCode: priceList.currencyCode || "LKR",
          minimumQuantity: "1",
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        }),
      );
      return;
    }
    const target = await this.sellingPriceTarget(
      manager,
      productId,
      tenantId,
      action.priceListItemId,
    );
    const status = this.sellingPriceStatus(target, now);
    if (action.action === "CANCEL_FUTURE_PRICE") {
      if (status !== "FUTURE")
        throw new BadRequestException(
          "Only a future scheduled price can be cancelled.",
        );
      await repo.update(
        { priceListItemId: target.priceListItemId, tenantId, productId },
        { isActive: false },
      );
      return;
    }
    if (action.action === "CHANGE_PRICE") {
      if (status !== "CURRENT")
        throw new BadRequestException(
          "Only the current selling price can be changed.",
        );
      if (!action.price || action.price <= 0)
        throw new BadRequestException(
          "New selling price must be greater than zero.",
        );
      const from =
        action.effectiveMode === "SCHEDULED"
          ? this.actionDate(action.effectiveFrom, "Effective From")
          : now;
      if (action.effectiveMode === "SCHEDULED" && from <= now)
        throw new BadRequestException(
          "A scheduled selling price must start in the future.",
        );
      if (from <= target.effectiveFrom)
        throw new BadRequestException(
          "New selling price must start after the current revision.",
        );
      const context = await this.activeSellingPriceContext(
        manager,
        target,
        now,
      );
      if (
        context.some(
          (row) =>
            Number(row.priceListItemId) !== Number(target.priceListItemId) &&
            row.effectiveFrom >= from,
        )
      )
        throw new BadRequestException(
          "A future selling price already exists for this combination. Cancel it before scheduling another change.",
        );
      const end = new Date(from.getTime() - 1);
      await repo.update(
        { priceListItemId: target.priceListItemId, tenantId, productId },
        { effectiveTo: end },
      );
      await repo.save(
        repo.create({
          tenantId,
          productId,
          priceListId: target.priceListId,
          productUnitId: target.productUnitId,
          unitId: target.unitId,
          sellingPrice: String(action.price),
          currencyCode: target.currencyCode,
          minimumQuantity: target.minimumQuantity,
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        }),
      );
      return;
    }
    if (action.action === "END_PRICE") {
      if (status !== "CURRENT")
        throw new BadRequestException(
          "Only the current selling price can be ended.",
        );
      const end = this.actionDate(action.effectiveTo, "Effective End");
      if (end < now)
        throw new BadRequestException("Effective End cannot be in the past.");
      if (end < target.effectiveFrom)
        throw new BadRequestException(
          "Effective End must be after the current price start.",
        );
      const context = await this.activeSellingPriceContext(
        manager,
        target,
        now,
      );
      const future = context
        .filter((row) => this.sellingPriceStatus(row, now) === "FUTURE")
        .sort(
          (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
        )[0];
      if (future && end >= future.effectiveFrom)
        throw new BadRequestException(
          "Effective End must be before the next scheduled selling price.",
        );
      await repo.update(
        { priceListItemId: target.priceListItemId, tenantId, productId },
        { effectiveTo: end },
      );
      return;
    }
    throw new BadRequestException("Unsupported selling price action.");
  }

  private supplierPriceStatus(
    row: Pick<
      ProductSupplierPrice,
      "isActive" | "effectiveFrom" | "effectiveTo"
    >,
    now = new Date(),
  ) {
    if (!row.isActive || (row.effectiveTo && row.effectiveTo < now))
      return "ENDED" as const;
    if (row.effectiveFrom > now) return "FUTURE" as const;
    return "CURRENT" as const;
  }

  private supplierPriceResponse(row: ProductSupplierPrice, now = new Date()) {
    const supplierUnit = row.productSupplierUnit;
    const link = supplierUnit?.productSupplier;
    return {
      productSupplierPriceId: Number(row.productSupplierPriceId),
      productSupplierUnitId: Number(row.productSupplierUnitId),
      purchasePrice: row.purchasePrice,
      currencyCode: row.currencyCode,
      minimumQuantity: Number(row.minimumQuantity),
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      status: this.supplierPriceStatus(row, now),
      supplier: link?.supplier
        ? {
            supplierId: Number(link.supplier.supplierId),
            supplierCode: link.supplier.supplierCode,
            supplierName: link.supplier.supplierName,
          }
        : undefined,
      productUnit: supplierUnit?.productUnit
        ? {
            productUnitId: Number(supplierUnit.productUnit.productUnitId),
            unitId: Number(supplierUnit.productUnit.unitId),
            unit: supplierUnit.productUnit.unit
              ? {
                  unitId: Number(supplierUnit.productUnit.unit.unitId),
                  code: supplierUnit.productUnit.unit.code,
                  name: supplierUnit.productUnit.unit.name,
                }
              : undefined,
          }
        : undefined,
    };
  }

  async getSupplierPurchasePriceSummary(
    productId: number,
    tenantId: number,
    manager: EntityManager = this.dataSource.manager,
  ) {
    await this.assertProductOwner(manager, productId, tenantId);
    const now = new Date();
    const supplierUnits = await manager
      .getRepository(ProductSupplierUnit)
      .find({
        where: { productSupplier: { productId } } as any,
        relations: {
          productSupplier: { supplier: true },
          productUnit: { unit: true },
          prices: true,
        },
        order: { productSupplierUnitId: "ASC" },
      });
    const result: Record<string, unknown>[] = [];
    for (const supplierUnit of supplierUnits) {
      const link = supplierUnit.productSupplier;
      const groups = new Map<string, ProductSupplierPrice[]>();
      for (const row of supplierUnit.prices ?? []) {
        row.productSupplierUnit = supplierUnit;
        const key = `${row.currencyCode}:${Number(row.minimumQuantity)}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      for (const group of groups.values()) {
        group.sort(
          (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
        );
        const working = group.filter((row) => row.isActive);
        const current =
          working
            .filter((row) => this.supplierPriceStatus(row, now) === "CURRENT")
            .sort(
              (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
            )[0] ?? null;
        const nextScheduled =
          working
            .filter((row) => this.supplierPriceStatus(row, now) === "FUTURE")
            .sort(
              (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
            )[0] ?? null;
        if (!current && !nextScheduled) continue;
        result.push({
          productSupplierUnitId: Number(supplierUnit.productSupplierUnitId),
          minimumQuantity: 1,
          supplier: {
            supplierId: Number(link.supplier.supplierId),
            supplierCode: link.supplier.supplierCode,
            supplierName: link.supplier.supplierName,
          },
          productUnit: this.supplierPriceResponse(
            (current ?? nextScheduled)!,
            now,
          ).productUnit,
          current: current ? this.supplierPriceResponse(current, now) : null,
          nextScheduled: nextScheduled
            ? this.supplierPriceResponse(nextScheduled, now)
            : null,
        });
      }
    }
    return result.sort((a: any, b: any) =>
      a.supplier.supplierName.localeCompare(b.supplier.supplierName),
    );
  }

  async getSupplierPurchasePriceHistory(
    productId: number,
    tenantId: number,
    query: Record<string, string>,
  ) {
    await this.assertProductOwner(this.dataSource.manager, productId, tenantId);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = [25, 50, 100].includes(Number(query.limit))
      ? Number(query.limit)
      : 25;
    const now = new Date();
    const builder = this.dataSource.manager
      .getRepository(ProductSupplierPrice)
      .createQueryBuilder("price")
      .innerJoinAndSelect("price.productSupplierUnit", "supplierUnit")
      .innerJoinAndSelect("supplierUnit.productSupplier", "link")
      .innerJoinAndSelect("link.supplier", "supplier")
      .innerJoinAndSelect("supplierUnit.productUnit", "productUnit")
      .innerJoinAndSelect("productUnit.unit", "unit")
      .innerJoin(Product, "product", "product.product_id = link.product_id")
      .where("link.product_id = :productId AND product.tenant_id = :tenantId", {
        productId,
        tenantId,
      });
    if (query.supplierId)
      builder.andWhere("link.supplier_id = :supplierId", {
        supplierId: Number(query.supplierId),
      });
    if (query.productSupplierUnitId)
      builder.andWhere(
        "price.product_supplier_unit_id = :productSupplierUnitId",
        { productSupplierUnitId: Number(query.productSupplierUnitId) },
      );
    if (query.fromDate)
      builder.andWhere("price.effective_from >= :fromDate", {
        fromDate: new Date(`${query.fromDate.slice(0, 10)}T00:00:00.000`),
      });
    if (query.toDate)
      builder.andWhere("price.effective_from <= :toDate", {
        toDate: new Date(`${query.toDate.slice(0, 10)}T23:59:59.999`),
      });
    if (query.status === "CURRENT")
      builder.andWhere(
        "price.is_active = 1 AND price.effective_from <= :now AND (price.effective_to IS NULL OR price.effective_to >= :now)",
        { now },
      );
    if (query.status === "FUTURE")
      builder.andWhere("price.is_active = 1 AND price.effective_from > :now", {
        now,
      });
    if (query.status === "ENDED")
      builder.andWhere("(price.is_active = 0 OR price.effective_to < :now)", {
        now,
      });
    const [items, totalItems] = await builder
      .orderBy("price.effectiveFrom", "DESC")
      .addOrderBy("price.productSupplierPriceId", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items: items.map((row) => this.supplierPriceResponse(row, now)),
      page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    };
  }

  private async supplierPriceTarget(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    id?: number,
  ) {
    if (!id)
      throw new BadRequestException(
        "Supplier purchase price revision is required.",
      );
    const row = await manager
      .getRepository(ProductSupplierPrice)
      .findOne({
        where: { productSupplierPriceId: id },
        relations: {
          productSupplierUnit: {
            productSupplier: { product: true, supplier: true },
            productUnit: { unit: true },
          },
        },
      });
    if (
      !row ||
      Number(row.productSupplierUnit.productSupplier.productId) !==
        Number(productId) ||
      Number(row.productSupplierUnit.productSupplier.product.tenantId) !==
        Number(tenantId)
    )
      throw new BadRequestException(
        "Supplier purchase price revision does not belong to this product.",
      );
    return row;
  }

  private async activeSupplierPriceContext(
    manager: EntityManager,
    productSupplierUnitId: number,
    currencyCode: string,
    now: Date,
  ) {
    const rows = await manager
      .getRepository(ProductSupplierPrice)
      .find({
        where: {
          productSupplierUnitId,
          currencyCode,
          minimumQuantity: "1",
          isActive: true,
        },
      });
    return rows
      .filter((row) => !row.effectiveTo || row.effectiveTo >= now)
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  }

  async publishSupplierPurchasePrices(
    productId: number,
    dto: PublishSupplierPurchasePricesDto,
    tenantId: number,
  ) {
    if (!dto.actions.length)
      throw new BadRequestException(
        "At least one draft purchase-price action is required.",
      );
    await this.dataSource.transaction(async (manager) => {
      await this.assertProductOwner(manager, productId, tenantId);
      const targets = dto.actions
        .map((action) => action.productSupplierPriceId)
        .filter((id): id is number => Boolean(id));
      if (new Set(targets).size !== targets.length)
        throw new BadRequestException(
          "A purchase-price revision cannot have more than one draft action in the same publish batch.",
        );
      for (const action of dto.actions)
        await this.publishSupplierPurchasePriceAction(
          manager,
          productId,
          tenantId,
          action,
        );
    });
    return this.getSupplierPurchasePriceSummary(productId, tenantId);
  }

  private async publishSupplierPurchasePriceAction(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    action: SupplierPurchasePriceDraftActionDto,
  ) {
    const repo = manager.getRepository(ProductSupplierPrice);
    const now = new Date();
    if (action.action === "ADD_INITIAL_PRICE") {
      if (!action.price || action.price <= 0)
        throw new BadRequestException(
          "Purchase price must be greater than zero.",
        );
      if (!action.productSupplierUnitId)
        throw new BadRequestException("Supplier Purchase Unit is required.");
      const supplierUnit = await manager
        .getRepository(ProductSupplierUnit)
        .findOne({
          where: {
            productSupplierUnitId: action.productSupplierUnitId,
            isActive: true,
          },
          relations: { productSupplier: { product: true }, productUnit: true },
        });
      if (
  !supplierUnit ||
  !supplierUnit.productSupplier.isActive ||
  Number(supplierUnit.productSupplier.productId) !== Number(productId) ||
  Number(supplierUnit.productSupplier.product.tenantId) !== Number(tenantId)
)
        throw new BadRequestException(
          "Supplier Purchase Unit is not active for this product and tenant. Save Supplier Unit changes first.",
        );
      if (
        !supplierUnit.productUnit.isActive ||
        !supplierUnit.productUnit.isPurchaseUnit
      )
        throw new BadRequestException(
          "Purchase Unit is not active for this product. Save Product Unit changes first.",
        );
      const from =
        action.effectiveMode === "SCHEDULED"
          ? this.actionDate(action.effectiveFrom, "Effective From")
          : now;
      if (action.effectiveMode === "SCHEDULED" && from <= now)
        throw new BadRequestException(
          "A scheduled purchase price must start in the future.",
        );
      const context = await this.activeSupplierPriceContext(
        manager,
        supplierUnit.productSupplierUnitId,
        "LKR",
        now,
      );
      if (context.length)
        throw new BadRequestException(
          "A current or future purchase price already exists for this supplier and unit.",
        );
      await repo.save(
        repo.create({
          productSupplierUnitId: supplierUnit.productSupplierUnitId,
          purchasePrice: String(action.price),
          currencyCode: "LKR",
          minimumQuantity: "1",
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        }),
      );
      return;
    }
    const target = await this.supplierPriceTarget(
      manager,
      productId,
      tenantId,
      action.productSupplierPriceId,
    );
    const status = this.supplierPriceStatus(target, now);
    if (action.action === "CANCEL_FUTURE_PRICE") {
      if (status !== "FUTURE")
        throw new BadRequestException(
          "Only a future scheduled purchase price can be cancelled.",
        );
      await repo.update(
        { productSupplierPriceId: target.productSupplierPriceId },
        { isActive: false },
      );
      return;
    }
    if (action.action === "CHANGE_PRICE") {
      if (status !== "CURRENT")
        throw new BadRequestException(
          "Only the current purchase price can be changed.",
        );
      if (!action.price || action.price <= 0)
        throw new BadRequestException(
          "New purchase price must be greater than zero.",
        );
      const from =
        action.effectiveMode === "SCHEDULED"
          ? this.actionDate(action.effectiveFrom, "Effective From")
          : now;
      if (action.effectiveMode === "SCHEDULED" && from <= now)
        throw new BadRequestException(
          "A scheduled purchase price must start in the future.",
        );
      if (from <= target.effectiveFrom)
        throw new BadRequestException(
          "New purchase price must start after the current revision.",
        );
      const context = await this.activeSupplierPriceContext(
        manager,
        target.productSupplierUnitId,
        target.currencyCode,
        now,
      );
      if (
        context.some(
          (row) =>
            Number(row.productSupplierPriceId) !==
              Number(target.productSupplierPriceId) &&
            this.supplierPriceStatus(row, now) === "FUTURE",
        )
      )
        throw new BadRequestException(
          "A future purchase price already exists for this supplier and unit. Cancel it before scheduling another change.",
        );
      await repo.update(
        { productSupplierPriceId: target.productSupplierPriceId },
        { effectiveTo: new Date(from.getTime() - 1) },
      );
      await repo.save(
        repo.create({
          productSupplierUnitId: target.productSupplierUnitId,
          purchasePrice: String(action.price),
          currencyCode: target.currencyCode,
          minimumQuantity: "1",
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        }),
      );
      return;
    }
    if (action.action === "END_PRICE") {
      if (status !== "CURRENT")
        throw new BadRequestException(
          "Only the current purchase price can be ended.",
        );
      const end =
        action.effectiveMode === "NOW"
          ? now
          : this.actionDate(action.effectiveTo ?? undefined, "Effective End");
      if (end < now && action.effectiveMode !== "NOW")
        throw new BadRequestException("Effective End cannot be in the past.");
      if (end < target.effectiveFrom)
        throw new BadRequestException(
          "Effective End must be after the purchase price start.",
        );
      const context = await this.activeSupplierPriceContext(
        manager,
        target.productSupplierUnitId,
        target.currencyCode,
        now,
      );
      const future = context
        .filter((row) => this.supplierPriceStatus(row, now) === "FUTURE")
        .sort(
          (a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
        )[0];
      if (future && end >= future.effectiveFrom)
        throw new BadRequestException(
          "Effective End must be before the next scheduled purchase price.",
        );
      await repo.update(
        { productSupplierPriceId: target.productSupplierPriceId },
        { effectiveTo: end },
      );
      return;
    }
    throw new BadRequestException("Unsupported purchase-price action.");
  }

  private async syncProductUnits(
    manager: EntityManager,
    productId: number,
    rows: CreateProductDto["productUnits"] = [],
  ) {
    const repo = manager.getRepository(ProductUnit);
    const existing = await repo.find({
      where: { productId },
      relations: { unit: true },
    });
    const baseRows = rows.filter(
      (row) => row.isBaseUnit && row.isActive !== false,
    );
    if (baseRows.length !== 1)
      throw new BadRequestException(
        "Exactly one active base unit is required.",
      );
    if (Number(baseRows[0].conversionFactor) !== 1)
      throw new BadRequestException("Base unit conversion must be 1.");
    const product = await manager
      .getRepository(Product)
      .findOneByOrFail({ productId });
    if (Number(product.baseUnitId) !== Number(baseRows[0].unitId))
      throw new BadRequestException(
        "The selected base unit must match the Product base unit.",
      );
    const existingBase = existing.find((unit) => unit.isBaseUnit);
    if (
      existingBase &&
      Number(existingBase.unitId) !== Number(baseRows[0].unitId)
    )
      throw new BadRequestException(
        "Base unit cannot be changed after product creation.",
      );
    const baseUnitLocked =
      existing.length > 0 &&
      (await this.productHasTransactionsOrStock(manager, productId));
    if (
      baseUnitLocked &&
      existingBase &&
      (Number(existingBase.unitId) !== Number(baseRows[0].unitId) ||
        Number(existingBase.conversionFactor) !==
          Number(baseRows[0].conversionFactor))
    )
      throw new BadRequestException(
        "The base unit cannot be changed after transactions or stock records exist.",
      );
    const kept = new Set<number>();
    const unitMap = new Map<number, number>();
    for (const row of rows) {
      let entity = row.productUnitId
        ? existing.find(
            (x) => Number(x.productUnitId) === Number(row.productUnitId),
          )
        : undefined;
      if (row.productUnitId && !entity)
        throw new BadRequestException(
          "Product unit does not belong to this product.",
        );
      if (entity && Number(entity.unitId) !== Number(row.unitId)) {
        const reason = await this.productUnitReferenceReason(
          manager,
          Number(entity.productUnitId),
        );
        if (reason)
          throw new BadRequestException(
            `${entity.unit?.name ?? entity.unit?.code ?? "Product unit"} cannot be changed because it is used by ${reason}.`,
          );
      }
      entity =
        entity ??
        existing.find((x) => Number(x.unitId) === Number(row.unitId)) ??
        repo.create({ productId });
      if (row.isBaseUnit && row.isActive === false)
        throw new BadRequestException("The base unit cannot be deactivated.");
      const isBaseUnit = row.isBaseUnit ?? false;
      Object.assign(entity, {
        unitId: row.unitId,
        conversionFactor: isBaseUnit ? "1" : String(row.conversionFactor),
        isBaseUnit,
        isPurchaseUnit: row.isPurchaseUnit ?? false,
        isSalesUnit: isBaseUnit,
        isActive: row.isActive ?? true,
      });
      const saved = await repo.save(entity);
      kept.add(Number(saved.productUnitId));
      unitMap.set(Number(saved.unitId), Number(saved.productUnitId));
    }
    for (const entity of existing) {
      if (kept.has(Number(entity.productUnitId))) continue;
      if (entity.isBaseUnit)
        throw new BadRequestException("The base unit cannot be removed.");
      const reason = await this.productUnitReferenceReason(
        manager,
        Number(entity.productUnitId),
      );
      const unitName =
        entity.unit?.name ??
        entity.unit?.code ??
        `Product unit ${entity.productUnitId}`;
      if (reason)
        throw new BadRequestException(
          `${unitName} cannot be removed because it is used by ${reason}. Deactivate it instead.`,
        );
      await repo.delete({ productUnitId: entity.productUnitId, productId });
    }
    return unitMap;
  }

  private async syncIdentifiers(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    rows: CreateProductDto["identifiers"] = [],
  ) {
    const repo = manager.getRepository(ProductIdentifier),
      existing = await repo.findBy({ productId, tenantId }),
      kept = new Set<number>();
    if (
      rows.filter((row) => row.isActive !== false && row.isPrimary).length > 1
    )
      throw new BadRequestException(
        "Only one primary identifier is allowed per product.",
      );
    const identifierTypes = await manager
      .getRepository(IdentifierType)
      .findBy({
        identifierTypeId: In([
          ...new Set(rows.map((row) => Number(row.identifierTypeId))),
        ]),
      });
    for (const row of rows) {
      let entity = row.productIdentifierId
        ? existing.find(
            (x) =>
              Number(x.productIdentifierId) === Number(row.productIdentifierId),
          )
        : undefined;
      if (row.productIdentifierId && !entity)
        throw new BadRequestException(
          "Product identifier does not belong to this product.",
        );
      const normalizedIdentifierValue = normalizeProductIdentifier(
        row.identifierValue,
      );
      const identifierType = identifierTypes.find(
        (type) =>
          Number(type.identifierTypeId) === Number(row.identifierTypeId),
      );
      if (!identifierType?.isActive)
        throw new BadRequestException("Identifier type is not active.");
      const requiresBaseUnit = [
        "BARCODE",
        "EAN",
        "UPC",
        "GTIN",
        "PLU",
      ].includes(identifierType.code.trim().toUpperCase());
      let productUnitId = row.productUnitId;
      if (requiresBaseUnit && !productUnitId) {
        const baseProductUnit = await manager
          .getRepository(ProductUnit)
          .findOneBy({ productId, isBaseUnit: true, isActive: true });
        productUnitId = baseProductUnit?.productUnitId;
      }
      if (requiresBaseUnit && !productUnitId)
        throw new BadRequestException(
          `${identifierType.code} identifiers require the active base Product Unit.`,
        );
      if (productUnitId) {
        const productUnit = await manager
          .getRepository(ProductUnit)
          .findOneBy({ productUnitId, productId, isActive: true });
        if (!productUnit)
          throw new BadRequestException(
            "Identifier Product Unit must be active and belong to this product and tenant.",
          );
        if (
          requiresBaseUnit &&
          (!productUnit.isBaseUnit || !productUnit.isSalesUnit)
        )
          throw new BadRequestException(
            `${identifierType.code} identifiers can only use the active base Product Unit.`,
          );
      }
      const conflict = await repo.findOne({
        where: {
          tenantId,
          normalizedIdentifierValue,
          ...(entity
            ? { productIdentifierId: Not(entity.productIdentifierId) }
            : {}),
        },
      });
      if (conflict && Number(conflict.productId) !== productId)
        throw new BadRequestException({
          message:
            "Identifier already belongs to another product in this tenant.",
          identifierValue: normalizedIdentifierValue,
        });
      if (conflict)
        throw new BadRequestException("Duplicate product identifier.");
      entity = entity ?? repo.create({ productId, tenantId });
      Object.assign(entity, {
        tenantId,
        productId,
        identifierTypeId: row.identifierTypeId,
        productUnitId: productUnitId ?? null,
        identifierValue: row.identifierValue.trim(),
        normalizedIdentifierValue,
        isPrimary: row.isPrimary ?? false,
        isActive: row.isActive ?? true,
      });
      try {
        const saved = await repo.save(entity);
        kept.add(Number(saved.productIdentifierId));
      } catch (error: any) {
        if (
          error?.code === "ER_DUP_ENTRY" ||
          error?.driverError?.code === "ER_DUP_ENTRY"
        )
          throw new BadRequestException({
            message:
              "Identifier already belongs to another product in this tenant.",
            identifierValue: normalizedIdentifierValue,
          });
        throw error;
      }
    }
    for (const entity of existing)
      if (!kept.has(Number(entity.productIdentifierId)))
        await repo.update(
          {
            productIdentifierId: entity.productIdentifierId,
            productId,
            tenantId,
          },
          { isActive: false },
        );
  }

  private async syncLocations(
    manager: EntityManager,
    productId: number,
    rows: CreateProductDto["locations"] = [],
  ) {
    const locationIds = rows.map((row) => Number(row.locationId));
    if (new Set(locationIds).size !== locationIds.length)
      throw new BadRequestException(
        "The same location cannot be assigned to a product more than once.",
      );
    const repo = manager.getRepository(ProductLocation),
      existing = await repo.findBy({ productId }),
      kept = new Set<number>();
    for (const row of rows) {
      let entity = row.productLocationId
        ? existing.find(
            (x) =>
              Number(x.productLocationId) === Number(row.productLocationId),
          )
        : undefined;
      if (row.productLocationId && !entity)
        throw new BadRequestException(
          "Product location does not belong to this product.",
        );
      entity =
        entity ??
        existing.find((x) => Number(x.locationId) === Number(row.locationId)) ??
        repo.create({ productId });
      Object.assign(entity, {
        locationId: row.locationId,
        isSellable: row.isSellable ?? true,
        isPurchasable: row.isPurchasable ?? true,
        isActive: true,
      });
      const saved = await repo.save(entity);
      kept.add(Number(saved.productLocationId));
    }
    for (const entity of existing)
      if (!kept.has(Number(entity.productLocationId)))
        await repo.update(
          { productLocationId: entity.productLocationId, productId },
          { isActive: false },
        );
  }

  private async syncAttributes(
    manager: EntityManager,
    productId: number,
    rows: CreateProductDto["productAttributes"] = [],
  ) {
    const attributeIds = rows.map((row) => Number(row.attributeId));
    if (new Set(attributeIds).size !== attributeIds.length)
      throw new BadRequestException(
        "The same attribute cannot be assigned to a product more than once.",
      );
    const repo = manager.getRepository(ProductAttributes),
      existing = await repo.findBy({ productId }),
      kept = new Set<number>();
    for (const row of rows) {
      let entity = row.productAttributeId
        ? existing.find(
            (x) =>
              Number(x.productAttributeId) === Number(row.productAttributeId),
          )
        : undefined;
      if (row.productAttributeId && !entity)
        throw new BadRequestException(
          "Product attribute does not belong to this product.",
        );
      entity = entity ?? repo.create({ productId });
      Object.assign(entity, { attributeId: row.attributeId, value: row.value });
      const saved = await repo.save(entity);
      kept.add(Number(saved.productAttributeId));
    }
    const removed = existing.filter(
      (x) => !kept.has(Number(x.productAttributeId)),
    );
    if (removed.length)
      await repo.delete({
        productAttributeId: In(removed.map((x) => x.productAttributeId)),
        productId,
      });
  }

  private async syncSellingPrices(
    manager: EntityManager,
    productId: number,
    rows: CreateProductDto["prices"] = [],
    removedIds: number[] = [],
    tenantId?: number,
  ) {
    const repo = manager.getRepository(PriceListItem);
    const existing = await repo.findBy({ productId });
    for (const priceId of [...new Set(removedIds.map(Number))]) {
      const entity = existing.find(
        (row) => Number(row.priceListItemId) === priceId,
      );
      if (!entity)
        throw new BadRequestException(
          "Selling price does not belong to this product.",
        );
      await this.assertPriceHasNoReferences(manager, "selling", priceId);
      await repo.delete({ priceListItemId: priceId, productId });
      existing.splice(existing.indexOf(entity), 1);
    }
    for (const row of rows) {
      if (row.priceListItemId) {
        const entity = existing.find(
          (x) => Number(x.priceListItemId) === Number(row.priceListItemId),
        );
        if (!entity)
          throw new BadRequestException(
            "Selling price does not belong to this product.",
          );
        if (
          Number(entity.priceListId) !== Number(row.priceListId) ||
          Number(entity.unitId) !== Number(row.unitId) ||
          entity.currencyCode !== (row.currencyCode || "LKR").toUpperCase() ||
          Number(entity.minimumQuantity) !== 1 ||
          Number(entity.sellingPrice) !== Number(row.sellingPrice)
        )
          throw new BadRequestException(
            "Historical selling prices cannot be overwritten. Schedule a new price instead.",
          );
        const to = row.effectiveTo ? priceDateEnd(row.effectiveTo) : null;
        if (to && to < entity.effectiveFrom)
          throw new BadRequestException(
            "Selling price effectiveTo must be after effectiveFrom.",
          );
        const context = existing.filter(
          (candidate) =>
            Number(candidate.priceListItemId) !==
              Number(entity.priceListItemId) &&
            Number(candidate.priceListId) === Number(entity.priceListId) &&
            Number(candidate.unitId) === Number(entity.unitId) &&
            candidate.currencyCode === entity.currencyCode &&
            Number(candidate.minimumQuantity) ===
              Number(entity.minimumQuantity) &&
            candidate.isActive,
        );
        if (
          context.some((candidate) =>
            periodsOverlap(
              candidate.effectiveFrom,
              candidate.effectiveTo,
              entity.effectiveFrom,
              to,
            ),
          )
        )
          throw new BadRequestException(
            "Selling price effective periods cannot overlap.",
          );
        if (row.isActive === false) {
          if (entity.effectiveFrom <= new Date())
            throw new BadRequestException(
              "Only future selling prices can be deactivated.",
            );
          await repo.update(
            { priceListItemId: entity.priceListItemId, productId },
            { isActive: false },
          );
        } else if (
          (entity.effectiveTo?.getTime() ?? null) !== (to?.getTime() ?? null)
        ) {
          await repo.update(
            { priceListItemId: entity.priceListItemId, productId },
            { effectiveTo: to },
          );
          entity.effectiveTo = to;
        }
        continue;
      }
      const from = priceDateStart(row.effectiveFrom),
        to = row.effectiveTo ? priceDateEnd(row.effectiveTo) : null,
        currency = (row.currencyCode || "LKR").toUpperCase();
      if (to && to < from)
        throw new BadRequestException(
          "Selling price effectiveTo must be after effectiveFrom.",
        );
      const context = existing.filter(
        (x) =>
          Number(x.priceListId) === Number(row.priceListId) &&
          Number(x.unitId) === Number(row.unitId) &&
          x.currencyCode === currency &&
          Number(x.minimumQuantity) === 1 &&
          x.isActive,
      );
      const laterOverlap = context.find(
        (x) =>
          x.effectiveFrom >= from &&
          periodsOverlap(x.effectiveFrom, x.effectiveTo, from, to),
      );
      if (laterOverlap)
        throw new BadRequestException(
          "Selling price effective periods cannot overlap.",
        );
      const prior = context
        .filter(
          (x) =>
            x.effectiveFrom < from && (!x.effectiveTo || x.effectiveTo >= from),
        )
        .sort(
          (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
        )[0];
      if (prior)
        await repo.update(
          { priceListItemId: prior.priceListItemId, productId },
          { effectiveTo: new Date(from.getTime() - 1) },
        );
      const productUnit = await manager
        .getRepository(ProductUnit)
        .findOneBy({ productId, unitId: row.unitId });
      if (!productUnit)
        throw new BadRequestException(
          "Selling price unit is not configured for this product.",
        );
      if (
        !productUnit.isActive ||
        !productUnit.isBaseUnit ||
        !productUnit.isSalesUnit ||
        Number(productUnit.conversionFactor) !== 1
      )
        throw new BadRequestException(
          "Selling prices can only use the active base Product Unit.",
        );
      const saved = await repo.save(
        repo.create({
          tenantId,
          productId,
          productUnitId: productUnit.productUnitId,
          priceListId: row.priceListId,
          unitId: row.unitId,
          sellingPrice: String(row.sellingPrice),
          currencyCode: currency,
          minimumQuantity: "1",
          effectiveFrom: from,
          effectiveTo: to,
          isActive: row.isActive ?? true,
        }),
      );
      existing.push(saved);
    }
  }

  private async createSupplierAggregate(
    manager: EntityManager,
    productId: number,
    links: NonNullable<CreateProductDto["supplierLinks"]>,
    unitMap: Map<number, number>,
  ) {
    const linkRepo = manager.getRepository(ProductSupplier);
    const supplierUnitRepo = manager.getRepository(ProductSupplierUnit);
    const priceRepo = manager.getRepository(ProductSupplierPrice);
    for (const input of links) {
      const link = await linkRepo.save(
        linkRepo.create({
          productId,
          supplierId: input.supplierId,
          isPrimarySupplier: input.isPrimarySupplier ?? false,
          isActive: input.isActive ?? true,
        }),
      );
      const explicitDefault = input.units.findIndex(
        (unit) => unit.isActive !== false && unit.isDefaultPurchaseUnit,
      );
      const firstActive = input.units.findIndex(
        (unit) => unit.isActive !== false,
      );
      for (const [unitIndex, unitInput] of input.units.entries()) {
        const productUnitId = unitMap.get(Number(unitInput.unitId));
        if (!productUnitId)
          throw new BadRequestException(
            "Invalid product unit for supplier purchase unit.",
          );
        const supplierUnit = await supplierUnitRepo.save(
          supplierUnitRepo.create({
            productSupplierId: link.productSupplierId,
            productUnitId,
            supplierProductCode: unitInput.supplierProductCode?.trim() || null,
            minimumOrderQty:
              unitInput.minimumOrderQty == null
                ? null
                : String(unitInput.minimumOrderQty),
            leadTimeDays: unitInput.leadTimeDays ?? null,
            isDefaultPurchaseUnit:
              unitInput.isActive !== false &&
              unitIndex ===
                (explicitDefault >= 0 ? explicitDefault : firstActive),
            isActive: unitInput.isActive ?? true,
          }),
        );
        const context: ProductSupplierPrice[] = [];
        for (const priceInput of unitInput.prices) {
          const effectiveFrom = priceDateStart(priceInput.effectiveFrom);
          const effectiveTo = priceInput.effectiveTo
            ? priceDateEnd(priceInput.effectiveTo)
            : null;
          if (effectiveTo && effectiveTo < effectiveFrom)
            throw new BadRequestException(
              "Supplier price effectiveTo must be after effectiveFrom.",
            );
          const currencyCode = (priceInput.currencyCode || "LKR").toUpperCase();
          if (
            context.some(
              (row) =>
                row.isActive &&
                row.currencyCode === currencyCode &&
                periodsOverlap(
                  row.effectiveFrom,
                  row.effectiveTo,
                  effectiveFrom,
                  effectiveTo,
                ),
            )
          )
            throw new BadRequestException(
              "Supplier price effective periods cannot overlap.",
            );
          const saved = await priceRepo.save(
            priceRepo.create({
              productSupplierUnitId: supplierUnit.productSupplierUnitId,
              purchasePrice: String(priceInput.purchasePrice),
              currencyCode,
              minimumQuantity: "1",
              effectiveFrom,
              effectiveTo,
              isActive: priceInput.isActive ?? true,
            }),
          );
          context.push(saved);
        }
      }
    }
  }

  private async syncSupplierLinks(
    manager: EntityManager,
    productId: number,
    rows: ProductSupplierLinkInputDto[],
  ) {
    if (new Set(rows.map((row) => Number(row.supplierId))).size !== rows.length)
      throw new BadRequestException("Duplicate product supplier.");
    if (
      rows.filter((row) => row.isActive !== false && row.isPrimarySupplier)
        .length > 1
    )
      throw new BadRequestException(
        "Only one primary supplier can be selected for a product.",
      );
    const repository = manager.getRepository(ProductSupplier);
    const existing = await repository.findBy({ productId });
    const kept = new Set<number>();
    for (const row of rows) {
      let link = row.productSupplierId
        ? existing.find(
            (candidate) =>
              Number(candidate.productSupplierId) ===
              Number(row.productSupplierId),
          )
        : existing.find(
            (candidate) =>
              Number(candidate.supplierId) === Number(row.supplierId),
          );
      if (row.productSupplierId && !link)
        throw new BadRequestException(
          "Product supplier does not belong to this product.",
        );
      if (link && Number(link.supplierId) !== Number(row.supplierId))
        throw new BadRequestException(
          "Supplier identity cannot be changed after the relationship is created.",
        );
      link =
        link ?? repository.create({ productId, supplierId: row.supplierId });
      Object.assign(link, {
        supplierId: row.supplierId,
        isPrimarySupplier:
          row.isActive === false ? false : (row.isPrimarySupplier ?? false),
        isActive: row.isActive ?? true,
      });
      const saved = await repository.save(link);
      kept.add(Number(saved.productSupplierId));
    }
    for (const link of existing)
      if (!kept.has(Number(link.productSupplierId)))
        await repository.update(
          { productSupplierId: link.productSupplierId, productId },
          { isActive: false, isPrimarySupplier: false },
        );
  }

  private async syncImages(
    manager: EntityManager,
    productId: number,
    tenantId: number,
    rows: CreateProductDto["images"] = [],
  ) {
    if (rows.filter((row) => row.isPrimary).length > 1)
      throw new BadRequestException(
        "Only one active product image can be primary.",
      );
    const repo = manager.getRepository(ProductImage);
    const existing = await repo.findBy({ productId, tenantId });
    if (rows.some((row) => row.isPrimary))
      await repo.update(
        { productId, tenantId, isActive: true },
        { isPrimary: false },
      );
    const kept = new Set<number>();
    for (const [index, row] of rows.entries()) {
      let image = row.productImageId
        ? existing.find(
            (candidate) =>
              Number(candidate.productImageId) === Number(row.productImageId),
          )
        : undefined;
      if (row.productImageId && !image)
        throw new BadRequestException(
          "Product image does not belong to this product or tenant.",
        );
      image = image ?? repo.create({ productId, tenantId });
      Object.assign(image, {
        tenantId,
        productId,
        imageUrl: row.imageUrl.trim(),
        fileName: row.fileName?.trim() || null,
        altText: row.altText?.trim() || null,
        displayOrder: row.displayOrder ?? index,
        isPrimary: row.isPrimary ?? false,
        isActive: true,
      });
      const saved = await repo.save(image);
      kept.add(Number(saved.productImageId));
    }
    const removed = existing.filter(
      (image) => !kept.has(Number(image.productImageId)) && image.isActive,
    );
    if (removed.length)
      await repo.update(
        {
          productImageId: In(removed.map((image) => image.productImageId)),
          productId,
          tenantId,
        },
        { isActive: false, isPrimary: false },
      );
  }

  async listImages(productId: number, tenantId: number) {
    await this.assertProductTenant(
      productId,
      tenantId,
      this.dataSource.manager,
    );
    const images = await this.dataSource
      .getRepository(ProductImage)
      .findBy({ productId, tenantId, isActive: true });
    return this.activeSortedImages(images);
  }

  async addImage(productId: number, dto: AddProductImageDto, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductTenant(productId, tenantId, manager);
      const repo = manager.getRepository(ProductImage);
      if (dto.isPrimary)
        await repo.update(
          { productId, tenantId, isActive: true },
          { isPrimary: false },
        );
      return repo.save(
        repo.create({
          tenantId,
          productId,
          imageUrl: dto.imageUrl.trim(),
          fileName: dto.fileName?.trim() || null,
          altText: dto.altText?.trim() || null,
          displayOrder: dto.displayOrder ?? 0,
          isPrimary: dto.isPrimary ?? false,
          isActive: true,
        }),
      );
    });
  }

  async updateImage(
    productId: number,
    imageId: number,
    dto: UpdateProductImageDto,
    tenantId: number,
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductTenant(productId, tenantId, manager);
      const repo = manager.getRepository(ProductImage);
      const image = await repo.findOneBy({
        productImageId: imageId,
        productId,
        tenantId,
        isActive: true,
      });
      if (!image) throw new NotFoundException("Product image not found.");
      if (dto.isPrimary)
        await repo.update(
          { productId, tenantId, isActive: true },
          { isPrimary: false },
        );
      if (dto.imageUrl !== undefined) image.imageUrl = dto.imageUrl.trim();
      if (dto.fileName !== undefined)
        image.fileName = dto.fileName.trim() || null;
      if (dto.altText !== undefined) image.altText = dto.altText.trim() || null;
      if (dto.displayOrder !== undefined) image.displayOrder = dto.displayOrder;
      if (dto.isPrimary !== undefined) image.isPrimary = dto.isPrimary;
      return repo.save(image);
    });
  }

  async deactivateImage(productId: number, imageId: number, tenantId: number) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertProductTenant(productId, tenantId, manager);
      const repo = manager.getRepository(ProductImage);
      const image = await repo.findOneBy({
        productImageId: imageId,
        productId,
        tenantId,
        isActive: true,
      });
      if (!image) throw new NotFoundException("Product image not found.");
      image.isActive = false;
      image.isPrimary = false;
      return repo.save(image);
    });
  }

  private async assertProductTenant(
    productId: number,
    tenantId: number,
    manager: EntityManager,
  ) {
    if (
      !(await manager.getRepository(Product).findOneBy({ productId, tenantId }))
    )
      throw new NotFoundException("Product not found");
  }

  async checkSellingPriceDeletion(
    productId: number,
    priceId: number,
    tenantId: number,
  ) {
    await this.assertProductPriceOwnership(
      productId,
      tenantId,
      "selling",
      priceId,
      this.dataSource.manager,
    );
    await this.assertPriceHasNoReferences(
      this.dataSource.manager,
      "selling",
      priceId,
    );
    return { canDelete: true };
  }

  async checkSupplierPriceDeletion(
    productId: number,
    priceId: number,
    tenantId: number,
  ) {
    await this.assertProductPriceOwnership(
      productId,
      tenantId,
      "supplier",
      priceId,
      this.dataSource.manager,
    );
    await this.assertPriceHasNoReferences(
      this.dataSource.manager,
      "supplier",
      priceId,
    );
    return { canDelete: true };
  }

  private async assertProductPriceOwnership(
    productId: number,
    tenantId: number,
    type: "selling" | "supplier",
    priceId: number,
    manager: EntityManager,
  ) {
    const product = await manager
      .getRepository(Product)
      .findOneBy({ productId, tenantId });
    if (!product) throw new NotFoundException("Product not found");
    if (type === "selling") {
      if (
        !(await manager
          .getRepository(PriceListItem)
          .findOneBy({ priceListItemId: priceId, productId }))
      )
        throw new NotFoundException("Selling price not found.");
      return;
    }
    const found = await manager
      .getRepository(ProductSupplierPrice)
      .createQueryBuilder("price")
      .innerJoin(
        ProductSupplierUnit,
        "supplierUnit",
        "supplierUnit.product_supplier_unit_id = price.product_supplier_unit_id",
      )
      .innerJoin(
        ProductSupplier,
        "link",
        "link.product_supplier_id = supplierUnit.product_supplier_id",
      )
      .where("price.product_supplier_price_id = :priceId", { priceId })
      .andWhere("link.product_id = :productId", { productId })
      .getOne();
    if (!found) throw new NotFoundException("Supplier price not found.");
  }

  private async assertPriceHasNoReferences(
    manager: EntityManager,
    type: "selling" | "supplier",
    priceId: number,
  ) {
    const references =
      type === "supplier"
        ? [
            ["tbl_purchase_order_line", "source_supplier_price_id"],
            ["tbl_goods_receipt_line", "source_supplier_price_id"],
          ]
        : [
            ["tbl_sales_order_line", "source_price_list_item_id"],
            ["tbl_sales_invoice_line", "source_price_list_item_id"],
            ["tbl_pos_sale_line", "source_price_list_item_id"],
          ];
    for (const [tableName, columnName] of references) {
      const columns: Array<{ count: string | number }> = await manager.query(
        "SELECT COUNT(*) AS count FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?",
        [tableName, columnName],
      );
      if (Number(columns[0]?.count || 0) === 0) continue;
      const rows: unknown[] = await manager.query(
        `SELECT 1 FROM \`${tableName}\` WHERE \`${columnName}\` = ? LIMIT 1`,
        [priceId],
      );
      if (rows.length)
        throw new BadRequestException(
          "This price has been used in a transaction and cannot be deleted. Use End Price instead.",
        );
    }
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
