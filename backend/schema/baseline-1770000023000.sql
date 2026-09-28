SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE `migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timestamp` bigint NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_attribute` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `attribute_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `data_type` varchar(30) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`attribute_id`),
  KEY `FK_4d0495a258ffab5d3e307f33355` (`tenant_id`),
  CONSTRAINT `FK_4d0495a258ffab5d3e307f33355` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_brand` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `brand_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `brand_code` varchar(50) NOT NULL,
  `brand_name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`brand_id`),
  KEY `FK_9d34afe4564bb6d830194cd3631` (`tenant_id`),
  CONSTRAINT `FK_9d34afe4564bb6d830194cd3631` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_category` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `category_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `parent_category_id` bigint DEFAULT NULL,
  `category_code` varchar(50) NOT NULL,
  `category_name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `sort_order` int DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`category_id`),
  KEY `FK_340e47a51975c266f488b3d4ab3` (`tenant_id`),
  KEY `FK_8b32bba722080ff25da2f8baa12` (`parent_category_id`),
  CONSTRAINT `FK_340e47a51975c266f488b3d4ab3` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`),
  CONSTRAINT `FK_8b32bba722080ff25da2f8baa12` FOREIGN KEY (`parent_category_id`) REFERENCES `tbl_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_customer` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `customer_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `customer_code` varchar(50) NOT NULL,
  `customer_name` varchar(200) NOT NULL,
  `contact_name` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `address_line_1` varchar(255) DEFAULT NULL,
  `address_line_2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`customer_id`),
  KEY `FK_f3cfde4621b65ab86331ab7cd8b` (`tenant_id`),
  CONSTRAINT `FK_f3cfde4621b65ab86331ab7cd8b` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_goods_receipt` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `goods_receipt_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `grn_number` varchar(50) DEFAULT NULL,
  `receipt_type` varchar(20) NOT NULL,
  `purchase_order_id` bigint DEFAULT NULL,
  `supplier_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `supplier_invoice_number` varchar(100) DEFAULT NULL,
  `supplier_invoice_date` date DEFAULT NULL,
  `supplier_delivery_note_number` varchar(100) DEFAULT NULL,
  `receipt_date` date NOT NULL,
  `currency_code` varchar(3) NOT NULL DEFAULT 'LKR',
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `notes` text,
  `created_by_user_id` bigint NOT NULL,
  `posted_by_user_id` bigint DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `cancelled_by_user_id` bigint DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `reversal_reason` varchar(1000) DEFAULT NULL,
  `reversed_by_user_id` bigint DEFAULT NULL,
  `reversed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`goods_receipt_id`),
  UNIQUE KEY `IDX_c8075d4a8ba6c44f19cd169a77` (`tenant_id`,`grn_number`),
  KEY `FK_865120a3f8bbeaab65fbc88dfb8` (`purchase_order_id`),
  KEY `FK_3b45ad2d0304aeafe54abdbe77c` (`supplier_id`),
  KEY `FK_2340e962fc0e98e07904a884b9e` (`location_id`),
  KEY `FK_e912f1c2c1aea96041b99df251f` (`created_by_user_id`),
  KEY `FK_2e03854332d61768d35912b2052` (`posted_by_user_id`),
  KEY `FK_9d81517522aa00bca9006c4ff49` (`cancelled_by_user_id`),
  KEY `idx_grn_reversed_user` (`reversed_by_user_id`),
  CONSTRAINT `FK_2340e962fc0e98e07904a884b9e` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_2e03854332d61768d35912b2052` FOREIGN KEY (`posted_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `FK_3b45ad2d0304aeafe54abdbe77c` FOREIGN KEY (`supplier_id`) REFERENCES `tbl_supplier` (`supplier_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_865120a3f8bbeaab65fbc88dfb8` FOREIGN KEY (`purchase_order_id`) REFERENCES `tbl_purchase_order` (`purchase_order_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_9d81517522aa00bca9006c4ff49` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `FK_d3094f1d96b944a117d7cb8642b` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_e912f1c2c1aea96041b99df251f` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_grn_reversed_user` FOREIGN KEY (`reversed_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_goods_receipt_line` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `goods_receipt_line_id` bigint NOT NULL AUTO_INCREMENT,
  `goods_receipt_id` bigint NOT NULL,
  `purchase_order_line_id` bigint DEFAULT NULL,
  `product_id` bigint NOT NULL,
  `unit_id` bigint NOT NULL,
  `received_qty` decimal(18,4) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `discount_amount` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `tax_amount` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `net_unit_cost` decimal(18,4) NOT NULL,
  `line_total` decimal(18,4) NOT NULL,
  `batch_number` varchar(100) DEFAULT NULL,
  `manufacture_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `notes` text,
  `source_supplier_price_id` bigint DEFAULT NULL,
  `product_unit_id` bigint DEFAULT NULL,
  `conversion_factor_snapshot` decimal(18,6) DEFAULT NULL,
  `cost_override_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`goods_receipt_line_id`),
  KEY `FK_82c007a524bfc62139854faa2e4` (`goods_receipt_id`),
  KEY `FK_161500e6537e86ba8e44ccc3fbe` (`purchase_order_line_id`),
  KEY `FK_fc67008ddf6eaedfd2423c8452c` (`product_id`),
  KEY `FK_1cbd5dc45c97fa84bb878c77242` (`unit_id`),
  KEY `idx_goods_receipt_line_source_supplier_price` (`source_supplier_price_id`),
  KEY `idx_goods_receipt_line_product_unit` (`product_unit_id`),
  CONSTRAINT `FK_161500e6537e86ba8e44ccc3fbe` FOREIGN KEY (`purchase_order_line_id`) REFERENCES `tbl_purchase_order_line` (`purchase_order_line_id`) ON DELETE SET NULL,
  CONSTRAINT `FK_1cbd5dc45c97fa84bb878c77242` FOREIGN KEY (`unit_id`) REFERENCES `tbl_unit_of_measure` (`unit_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_82c007a524bfc62139854faa2e4` FOREIGN KEY (`goods_receipt_id`) REFERENCES `tbl_goods_receipt` (`goods_receipt_id`) ON DELETE CASCADE,
  CONSTRAINT `FK_fc67008ddf6eaedfd2423c8452c` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_goods_receipt_line_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_goods_receipt_line_source_supplier_price` FOREIGN KEY (`source_supplier_price_id`) REFERENCES `tbl_product_supplier_price` (`product_supplier_price_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_identifier_type` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `identifier_type_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`identifier_type_id`),
  UNIQUE KEY `IDX_25bf63c363a2fbe8edfd0a6681` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_adjustment` (
  `inventory_adjustment_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `adjustment_number` varchar(50) DEFAULT NULL,
  `location_id` bigint NOT NULL,
  `movement_type` varchar(10) NOT NULL,
  `reason_id` bigint NOT NULL,
  `adjustment_date` date NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `remarks` text,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `created_by_user_id` bigint NOT NULL,
  `posted_by_user_id` bigint DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `cancelled_by_user_id` bigint DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`inventory_adjustment_id`),
  UNIQUE KEY `uq_inventory_adjustment_tenant_number` (`tenant_id`,`adjustment_number`),
  KEY `idx_inventory_adjustment_tenant_date` (`tenant_id`,`adjustment_date`),
  KEY `idx_inventory_adjustment_location_status` (`location_id`,`status`),
  KEY `fk_inventory_adjustment_reason` (`reason_id`),
  KEY `fk_inventory_adjustment_created_user` (`created_by_user_id`),
  KEY `fk_inventory_adjustment_posted_user` (`posted_by_user_id`),
  KEY `fk_inventory_adjustment_cancelled_user` (`cancelled_by_user_id`),
  CONSTRAINT `fk_inventory_adjustment_cancelled_user` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inventory_adjustment_created_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_adjustment_location` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_adjustment_posted_user` FOREIGN KEY (`posted_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inventory_adjustment_reason` FOREIGN KEY (`reason_id`) REFERENCES `tbl_inventory_adjustment_reason` (`inventory_adjustment_reason_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_adjustment_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_adjustment_line` (
  `inventory_adjustment_line_id` bigint NOT NULL AUTO_INCREMENT,
  `inventory_adjustment_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `product_unit_id` bigint NOT NULL,
  `conversion_factor_snapshot` decimal(18,6) NOT NULL,
  `quantity` decimal(18,4) NOT NULL,
  `base_quantity` decimal(18,4) NOT NULL,
  `unit_cost` decimal(18,4) DEFAULT NULL,
  `inventory_value` decimal(18,4) DEFAULT NULL,
  `remarks` text,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `quantity_before` decimal(18,4) DEFAULT NULL,
  `quantity_after` decimal(18,4) DEFAULT NULL,
  PRIMARY KEY (`inventory_adjustment_line_id`),
  UNIQUE KEY `uq_inventory_adjustment_line_product` (`inventory_adjustment_id`,`product_id`),
  KEY `fk_inventory_adjustment_line_product` (`product_id`),
  KEY `fk_inventory_adjustment_line_product_unit` (`product_unit_id`),
  CONSTRAINT `fk_inventory_adjustment_line_header` FOREIGN KEY (`inventory_adjustment_id`) REFERENCES `tbl_inventory_adjustment` (`inventory_adjustment_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_adjustment_line_product` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_adjustment_line_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_adjustment_reason` (
  `inventory_adjustment_reason_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `allowed_direction` varchar(10) NOT NULL,
  `reason_category` varchar(100) DEFAULT NULL,
  `costing_policy` varchar(30) NOT NULL,
  `requires_remarks` tinyint NOT NULL DEFAULT '0',
  `requires_approval` tinyint NOT NULL DEFAULT '0',
  `is_system_reason` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`inventory_adjustment_reason_id`),
  UNIQUE KEY `uq_inventory_adjustment_reason_tenant_code` (`tenant_id`,`code`),
  CONSTRAINT `fk_inventory_adjustment_reason_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_age_layer` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `inventory_age_layer_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `source_document_type` varchar(30) NOT NULL,
  `source_document_id` bigint NOT NULL,
  `source_document_line_id` bigint NOT NULL,
  `receipt_date` date NOT NULL,
  `original_quantity` decimal(18,4) NOT NULL,
  `remaining_quantity` decimal(18,4) NOT NULL,
  `original_unit_cost` decimal(18,4) NOT NULL,
  `batch_number` varchar(100) DEFAULT NULL,
  `manufacture_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`inventory_age_layer_id`),
  UNIQUE KEY `uq_inventory_age_layer_source` (`tenant_id`,`source_document_type`,`source_document_id`,`source_document_line_id`),
  KEY `FK_dfca37054505c6794d5e6f8e16e` (`location_id`),
  KEY `FK_a76fafa7a9821831425db29b34f` (`product_id`),
  CONSTRAINT `FK_1bf6baa20a34d3be295b591b676` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_a76fafa7a9821831425db29b34f` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_dfca37054505c6794d5e6f8e16e` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_balance` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `inventory_balance_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `quantity_on_hand` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `average_cost` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `last_movement_at` datetime DEFAULT NULL,
  PRIMARY KEY (`inventory_balance_id`),
  UNIQUE KEY `IDX_51ecba9f7cd56aa45f401e1d93` (`tenant_id`,`location_id`,`product_id`),
  KEY `FK_18a90d464721232cad5ee367d6c` (`location_id`),
  KEY `FK_219bc2d7843a2eaa442c2ffd974` (`product_id`),
  CONSTRAINT `FK_18a90d464721232cad5ee367d6c` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_219bc2d7843a2eaa442c2ffd974` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_3c9f1afc05dfc5a7ef4fb7d326d` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_conversion` (
  `inventory_conversion_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `conversion_number` varchar(50) DEFAULT NULL,
  `location_id` bigint NOT NULL,
  `conversion_date` date NOT NULL,
  `allocation_method` varchar(30) NOT NULL,
  `remarks` text,
  `status` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `total_input_value` decimal(18,4) DEFAULT NULL,
  `total_output_value` decimal(18,4) DEFAULT NULL,
  `value_variance` decimal(18,4) DEFAULT NULL,
  `created_by_user_id` bigint NOT NULL,
  `posted_by_user_id` bigint DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `cancelled_by_user_id` bigint DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`inventory_conversion_id`),
  UNIQUE KEY `uq_inventory_conversion_tenant_number` (`tenant_id`,`conversion_number`),
  KEY `idx_inventory_conversion_tenant_date` (`tenant_id`,`conversion_date`),
  KEY `idx_inventory_conversion_location_status` (`location_id`,`status`),
  KEY `fk_inventory_conversion_created_user` (`created_by_user_id`),
  KEY `fk_inventory_conversion_posted_user` (`posted_by_user_id`),
  KEY `fk_inventory_conversion_cancelled_user` (`cancelled_by_user_id`),
  CONSTRAINT `fk_inventory_conversion_cancelled_user` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inventory_conversion_created_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_conversion_location` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_conversion_posted_user` FOREIGN KEY (`posted_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inventory_conversion_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_conversion_line` (
  `inventory_conversion_line_id` bigint NOT NULL AUTO_INCREMENT,
  `inventory_conversion_id` bigint NOT NULL,
  `movement_type` varchar(10) NOT NULL,
  `product_id` bigint NOT NULL,
  `product_unit_id` bigint NOT NULL,
  `conversion_factor_snapshot` decimal(18,6) NOT NULL,
  `quantity` decimal(18,4) NOT NULL,
  `base_quantity` decimal(18,4) NOT NULL,
  `quantity_before` decimal(18,4) DEFAULT NULL,
  `quantity_after` decimal(18,4) DEFAULT NULL,
  `wavg_before` decimal(18,4) DEFAULT NULL,
  `wavg_after` decimal(18,4) DEFAULT NULL,
  `posted_unit_cost` decimal(18,4) DEFAULT NULL,
  `posted_value` decimal(18,4) DEFAULT NULL,
  `allocation_percent` decimal(9,4) DEFAULT NULL,
  `allocation_basis_value` decimal(18,4) DEFAULT NULL,
  `allocated_value` decimal(18,4) DEFAULT NULL,
  `allocation_weight` decimal(18,4) DEFAULT NULL,
  `remarks` text,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`inventory_conversion_line_id`),
  UNIQUE KEY `uq_inventory_conversion_line_side_product` (`inventory_conversion_id`,`movement_type`,`product_id`),
  KEY `idx_inventory_conversion_line_product` (`product_id`),
  KEY `fk_inventory_conversion_line_product_unit` (`product_unit_id`),
  CONSTRAINT `fk_inventory_conversion_line_header` FOREIGN KEY (`inventory_conversion_id`) REFERENCES `tbl_inventory_conversion` (`inventory_conversion_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_conversion_line_product` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_conversion_line_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_inventory_ledger` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `inventory_ledger_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `movement_date` datetime NOT NULL,
  `movement_type` varchar(30) NOT NULL,
  `source_document_type` varchar(30) NOT NULL,
  `source_document_id` bigint NOT NULL,
  `source_document_line_id` bigint NOT NULL,
  `quantity_in` decimal(18,4) NOT NULL,
  `quantity_out` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `unit_cost` decimal(18,4) NOT NULL,
  `movement_value` decimal(18,4) NOT NULL,
  `quantity_before` decimal(18,4) NOT NULL,
  `quantity_after` decimal(18,4) NOT NULL,
  `average_cost_before` decimal(18,4) NOT NULL,
  `average_cost_after` decimal(18,4) NOT NULL,
  `created_by_user_id` bigint NOT NULL,
  `valuation_method` varchar(40) DEFAULT NULL,
  `original_document_value` decimal(18,4) DEFAULT NULL,
  `inventory_relief_value` decimal(18,4) DEFAULT NULL,
  `cost_variance` decimal(18,4) DEFAULT NULL,
  `reversal_of_ledger_id` bigint DEFAULT NULL,
  `business_date` date DEFAULT NULL,
  `age_layer_relief` json DEFAULT NULL,
  `inventory_adjustment_reason_id` bigint DEFAULT NULL,
  PRIMARY KEY (`inventory_ledger_id`),
  UNIQUE KEY `uq_inventory_ledger_source_movement` (`tenant_id`,`source_document_type`,`source_document_id`,`source_document_line_id`,`movement_type`),
  UNIQUE KEY `uq_inventory_ledger_reversal` (`reversal_of_ledger_id`),
  KEY `FK_048aeb9b399f7463c41f63cd3ca` (`location_id`),
  KEY `FK_d7fa19ace6e5dbe080a8e768752` (`product_id`),
  KEY `FK_9ce1de1130bdf379c219e1aaf5a` (`created_by_user_id`),
  KEY `idx_inventory_ledger_adjustment_reason` (`inventory_adjustment_reason_id`),
  CONSTRAINT `FK_048aeb9b399f7463c41f63cd3ca` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_9ce1de1130bdf379c219e1aaf5a` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_a0f7fccabce40a1113cdafc70f1` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_d7fa19ace6e5dbe080a8e768752` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_ledger_adjustment_reason` FOREIGN KEY (`inventory_adjustment_reason_id`) REFERENCES `tbl_inventory_adjustment_reason` (`inventory_adjustment_reason_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inventory_ledger_reversal` FOREIGN KEY (`reversal_of_ledger_id`) REFERENCES `tbl_inventory_ledger` (`inventory_ledger_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `customer_id` bigint DEFAULT NULL,
  `invoice_number` varchar(50) NOT NULL,
  `invoice_date` datetime NOT NULL,
  `sale_type` varchar(20) NOT NULL,
  `subtotal` decimal(18,2) NOT NULL,
  `discount_total` decimal(18,2) NOT NULL DEFAULT '0.00',
  `grand_total` decimal(18,2) NOT NULL,
  `paid_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `balance_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `payment_status` varchar(20) NOT NULL,
  `invoice_status` varchar(20) NOT NULL DEFAULT 'COMPLETED',
  `created_by_user_id` bigint NOT NULL,
  `tendered_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `change_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `uq_invoice_tenant_number` (`tenant_id`,`invoice_number`),
  KEY `FK_8b45fca91e2d72ba36f4cbce674` (`location_id`),
  KEY `FK_017b4288caf6d0f6c99541f3377` (`customer_id`),
  KEY `FK_c761c9746a278f965673d230aba` (`created_by_user_id`),
  CONSTRAINT `FK_017b4288caf6d0f6c99541f3377` FOREIGN KEY (`customer_id`) REFERENCES `tbl_customer` (`customer_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_62fc0026ff82d81f8b1ef4a3e90` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_8b45fca91e2d72ba36f4cbce674` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_c761c9746a278f965673d230aba` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_adjustment` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_adjustment_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `invoice_id` bigint NOT NULL,
  `invoice_detail_id` bigint NOT NULL,
  `adjustment_number` varchar(50) NOT NULL,
  `adjustment_date` datetime NOT NULL,
  `adjustment_type` varchar(10) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `original_discount_percentage` decimal(7,4) NOT NULL,
  `original_discount_amount` decimal(18,2) NOT NULL,
  `corrected_discount_percentage` decimal(7,4) NOT NULL,
  `corrected_discount_amount` decimal(18,2) NOT NULL,
  `adjustment_amount` decimal(18,2) NOT NULL,
  `payment_method_id` bigint DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'SETTLED',
  `created_by_user_id` bigint NOT NULL,
  PRIMARY KEY (`invoice_adjustment_id`),
  UNIQUE KEY `uq_invoice_adjustment_tenant_number` (`tenant_id`,`adjustment_number`),
  KEY `FK_1b6d7b3b6e0a0317057c0cbb7e6` (`invoice_id`),
  KEY `FK_30c113749b34e4fa77d56bbc57f` (`invoice_detail_id`),
  KEY `FK_a258e45ae8b7724c5d64153806d` (`payment_method_id`),
  KEY `FK_5808df33b8646ad651ffea4dc19` (`created_by_user_id`),
  CONSTRAINT `FK_1b6d7b3b6e0a0317057c0cbb7e6` FOREIGN KEY (`invoice_id`) REFERENCES `tbl_invoice` (`invoice_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_30c113749b34e4fa77d56bbc57f` FOREIGN KEY (`invoice_detail_id`) REFERENCES `tbl_invoice_detail` (`invoice_detail_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_5808df33b8646ad651ffea4dc19` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_6c14b3cc00b2abac104a68b8e17` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_a258e45ae8b7724c5d64153806d` FOREIGN KEY (`payment_method_id`) REFERENCES `tbl_payment_method` (`payment_method_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_detail` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_detail_id` bigint NOT NULL AUTO_INCREMENT,
  `invoice_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `quantity` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `discount_percentage` decimal(7,4) NOT NULL DEFAULT '0.0000',
  `discount_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `gross_total` decimal(18,2) NOT NULL,
  `net_total` decimal(18,2) NOT NULL,
  PRIMARY KEY (`invoice_detail_id`),
  KEY `FK_2f602d65e94ae32eeccec31ad5a` (`invoice_id`),
  KEY `FK_9ce5402b54deace2eefaa2990a0` (`product_id`),
  CONSTRAINT `FK_2f602d65e94ae32eeccec31ad5a` FOREIGN KEY (`invoice_id`) REFERENCES `tbl_invoice` (`invoice_id`) ON DELETE CASCADE,
  CONSTRAINT `FK_9ce5402b54deace2eefaa2990a0` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_payment` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_payment_id` bigint NOT NULL AUTO_INCREMENT,
  `invoice_id` bigint NOT NULL,
  `payment_method_id` bigint NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `paid_at` datetime NOT NULL,
  `created_by_user_id` bigint NOT NULL,
  `tendered_amount` decimal(18,2) NOT NULL,
  `change_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `is_reversed` tinyint NOT NULL DEFAULT '0',
  `reversed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`invoice_payment_id`),
  KEY `FK_85c229433d86b3e1ccac1c13f91` (`invoice_id`),
  KEY `FK_4780b4e71ca0027896b2ea0a8fc` (`payment_method_id`),
  KEY `FK_2194c2c108cabbd9888bf58efcd` (`created_by_user_id`),
  CONSTRAINT `FK_2194c2c108cabbd9888bf58efcd` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_4780b4e71ca0027896b2ea0a8fc` FOREIGN KEY (`payment_method_id`) REFERENCES `tbl_payment_method` (`payment_method_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_85c229433d86b3e1ccac1c13f91` FOREIGN KEY (`invoice_id`) REFERENCES `tbl_invoice` (`invoice_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_payment_reversal` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `payment_reversal_id` bigint NOT NULL AUTO_INCREMENT,
  `invoice_payment_id` bigint NOT NULL,
  `reversal_amount` decimal(18,2) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `reversed_at` datetime NOT NULL,
  `reversed_by_user_id` bigint NOT NULL,
  PRIMARY KEY (`payment_reversal_id`),
  KEY `FK_c7345e59635ba09d5768889dc4f` (`invoice_payment_id`),
  KEY `FK_c15755549b0b22528b4eba393c4` (`reversed_by_user_id`),
  CONSTRAINT `FK_c15755549b0b22528b4eba393c4` FOREIGN KEY (`reversed_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_c7345e59635ba09d5768889dc4f` FOREIGN KEY (`invoice_payment_id`) REFERENCES `tbl_invoice_payment` (`invoice_payment_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_refund` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_refund_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `invoice_id` bigint NOT NULL,
  `refund_number` varchar(50) NOT NULL,
  `refund_date` datetime NOT NULL,
  `reason` varchar(255) NOT NULL,
  `subtotal` decimal(18,2) NOT NULL,
  `discount_total` decimal(18,2) NOT NULL DEFAULT '0.00',
  `refund_total` decimal(18,2) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'COMPLETED',
  `created_by_user_id` bigint NOT NULL,
  `approved_by_user_id` bigint DEFAULT NULL,
  PRIMARY KEY (`invoice_refund_id`),
  UNIQUE KEY `uq_invoice_refund_tenant_number` (`tenant_id`,`refund_number`),
  KEY `FK_d6f72cfdf70245b19a21a1e9926` (`location_id`),
  KEY `FK_a1d69436095795736d3d382b453` (`invoice_id`),
  KEY `FK_d9730b80cda31bdcc02798705fe` (`created_by_user_id`),
  KEY `FK_ecfadcf171b833bf3d5f72211d2` (`approved_by_user_id`),
  CONSTRAINT `FK_a1d69436095795736d3d382b453` FOREIGN KEY (`invoice_id`) REFERENCES `tbl_invoice` (`invoice_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_b92b4429e5fdc835aacb2f22ca8` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_d6f72cfdf70245b19a21a1e9926` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_d9730b80cda31bdcc02798705fe` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_ecfadcf171b833bf3d5f72211d2` FOREIGN KEY (`approved_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_refund_detail` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_refund_detail_id` bigint NOT NULL AUTO_INCREMENT,
  `invoice_refund_id` bigint NOT NULL,
  `invoice_detail_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `quantity` decimal(18,4) NOT NULL,
  `unit_price` decimal(18,2) NOT NULL,
  `discount_percentage` decimal(7,4) NOT NULL DEFAULT '0.0000',
  `discount_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `refund_amount` decimal(18,2) NOT NULL,
  `return_to_stock` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`invoice_refund_detail_id`),
  KEY `FK_cc08e2b649963a7e2a12b05e91d` (`invoice_refund_id`),
  KEY `FK_dcc0e83a220fcd8037653fdaab4` (`invoice_detail_id`),
  KEY `FK_e19fca700ae3e87d919b3bc408e` (`product_id`),
  CONSTRAINT `FK_cc08e2b649963a7e2a12b05e91d` FOREIGN KEY (`invoice_refund_id`) REFERENCES `tbl_invoice_refund` (`invoice_refund_id`) ON DELETE CASCADE,
  CONSTRAINT `FK_dcc0e83a220fcd8037653fdaab4` FOREIGN KEY (`invoice_detail_id`) REFERENCES `tbl_invoice_detail` (`invoice_detail_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_e19fca700ae3e87d919b3bc408e` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_invoice_refund_payment` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `invoice_refund_payment_id` bigint NOT NULL AUTO_INCREMENT,
  `invoice_refund_id` bigint NOT NULL,
  `payment_method_id` bigint NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `refunded_at` datetime NOT NULL,
  `created_by_user_id` bigint NOT NULL,
  PRIMARY KEY (`invoice_refund_payment_id`),
  KEY `FK_1e516a354512b6e922fe93db0cc` (`invoice_refund_id`),
  KEY `FK_6ec2fa5d123e48c9cadd5fe3d4e` (`payment_method_id`),
  KEY `FK_69a19711f083ee57a1b4d41087b` (`created_by_user_id`),
  CONSTRAINT `FK_1e516a354512b6e922fe93db0cc` FOREIGN KEY (`invoice_refund_id`) REFERENCES `tbl_invoice_refund` (`invoice_refund_id`) ON DELETE CASCADE,
  CONSTRAINT `FK_69a19711f083ee57a1b4d41087b` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_6ec2fa5d123e48c9cadd5fe3d4e` FOREIGN KEY (`payment_method_id`) REFERENCES `tbl_payment_method` (`payment_method_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_location` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `location_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `location_type` varchar(50) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `contact_person` varchar(150) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address_line1` varchar(200) DEFAULT NULL,
  `address_line2` varchar(200) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state_province` varchar(100) DEFAULT NULL,
  `postal_code` varchar(30) DEFAULT NULL,
  `country_code` varchar(2) DEFAULT NULL,
  PRIMARY KEY (`location_id`),
  UNIQUE KEY `uq_location_tenant_code` (`tenant_id`,`code`),
  CONSTRAINT `FK_0ab9dfc287fe5fcaf7868bdfc8e` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_module` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `module_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `display_order` int DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`module_id`),
  UNIQUE KEY `IDX_87715efeb357589e871d33064e` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_number_sequence` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `number_sequence_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `sequence_key` varchar(50) NOT NULL,
  `last_number` bigint NOT NULL DEFAULT '0',
  `scope_key` varchar(100) NOT NULL,
  `period_key` varchar(20) NOT NULL,
  `tenant_sequence_key_guard` varchar(50) GENERATED ALWAYS AS ((case when ((`scope_key` = _utf8mb4'TENANT') and (`period_key` = _utf8mb4'NEVER')) then `sequence_key` else NULL end)) STORED,
  PRIMARY KEY (`number_sequence_id`),
  UNIQUE KEY `uq_number_sequence_scope` (`tenant_id`,`sequence_key`,`scope_key`,`period_key`),
  UNIQUE KEY `uq_number_sequence_tenant_key` (`tenant_id`,`tenant_sequence_key_guard`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_payment_method` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `payment_method_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `payment_method_name` varchar(150) NOT NULL,
  PRIMARY KEY (`payment_method_id`),
  UNIQUE KEY `uq_payment_method_tenant_name` (`tenant_id`,`payment_method_name`),
  KEY `ix_payment_method_tenant_id` (`tenant_id`),
  CONSTRAINT `FK_982255fedb215028a7fcef3fa50` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_permission` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `permission_id` bigint NOT NULL AUTO_INCREMENT,
  `module_id` bigint NOT NULL,
  `code` varchar(100) NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `IDX_bd3a348ba6a915b671e669e98c` (`code`),
  KEY `FK_94734bbe83aa7aee8277d5f02b4` (`module_id`),
  CONSTRAINT `FK_94734bbe83aa7aee8277d5f02b4` FOREIGN KEY (`module_id`) REFERENCES `tbl_module` (`module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_platform_session` (
  `platform_session_id` bigint NOT NULL AUTO_INCREMENT,
  `platform_user_id` bigint NOT NULL,
  `session_token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `last_activity_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`platform_session_id`),
  UNIQUE KEY `IDX_2c4173bfd6e738fde26acf5012` (`session_token_hash`),
  KEY `FK_58f61dc409c37682e55f171dbb9` (`platform_user_id`),
  CONSTRAINT `FK_58f61dc409c37682e55f171dbb9` FOREIGN KEY (`platform_user_id`) REFERENCES `tbl_platform_user` (`platform_user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_platform_user` (
  `platform_user_id` bigint NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `mobile` varchar(30) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`platform_user_id`),
  UNIQUE KEY `IDX_9c240d6e4adaf828907c2c1adf` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_price_list` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `price_list_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `price_list_type` varchar(50) NOT NULL,
  `currency_code` varchar(3) NOT NULL DEFAULT 'LKR',
  `is_default` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`price_list_id`),
  KEY `FK_a0757f6092f96e45b770d9e0fc9` (`tenant_id`),
  CONSTRAINT `FK_a0757f6092f96e45b770d9e0fc9` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_price_list_item` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `price_list_item_id` bigint NOT NULL AUTO_INCREMENT,
  `price_list_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `unit_id` bigint NOT NULL,
  `selling_price` decimal(18,4) NOT NULL,
  `currency_code` varchar(3) NOT NULL DEFAULT 'LKR',
  `minimum_quantity` decimal(18,6) NOT NULL DEFAULT '1.000000',
  `effective_from` datetime(3) NOT NULL,
  `effective_to` datetime(3) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `tenant_id` bigint NOT NULL,
  `product_unit_id` bigint NOT NULL,
  PRIMARY KEY (`price_list_item_id`),
  KEY `FK_434565dc7b2071656bee7d7ab7b` (`price_list_id`),
  KEY `FK_ebb95ccc907d291178e3c39e357` (`unit_id`),
  KEY `idx_price_list_item_effective_context` (`product_id`,`price_list_id`,`unit_id`,`minimum_quantity`,`effective_from`),
  KEY `idx_price_list_item_currency_effective_context` (`product_id`,`price_list_id`,`unit_id`,`currency_code`,`minimum_quantity`,`effective_from`),
  KEY `fk_price_list_item_product_unit` (`product_unit_id`),
  KEY `idx_selling_price_tenant_context` (`tenant_id`,`product_id`,`price_list_id`,`product_unit_id`,`minimum_quantity`,`effective_from`),
  CONSTRAINT `FK_220bd8c7d6f10324e8ed419d18f` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`),
  CONSTRAINT `FK_434565dc7b2071656bee7d7ab7b` FOREIGN KEY (`price_list_id`) REFERENCES `tbl_price_list` (`price_list_id`),
  CONSTRAINT `FK_ebb95ccc907d291178e3c39e357` FOREIGN KEY (`unit_id`) REFERENCES `tbl_unit_of_measure` (`unit_id`),
  CONSTRAINT `fk_price_list_item_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_price_list_item_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_price_list_item_discount` (
  `price_list_item_discount_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `price_list_item_id` bigint NOT NULL,
  `discount_type` enum('PERCENTAGE','FIXED_AMOUNT') NOT NULL,
  `discount_value` decimal(18,4) NOT NULL,
  `effective_from` datetime(3) NOT NULL,
  `effective_to` datetime(3) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` bigint NOT NULL,
  `ended_by` bigint DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`price_list_item_discount_id`),
  KEY `FK_9633388e9e1b8ef475e952b7189` (`price_list_item_id`),
  KEY `FK_c29c59c5febf8be3af85ef3691c` (`created_by`),
  KEY `FK_e6f54ecf29952459240634cf7ed` (`ended_by`),
  KEY `idx_price_item_discount_active_period` (`tenant_id`,`price_list_item_id`,`is_active`,`effective_from`,`effective_to`),
  KEY `idx_price_item_discount_history` (`tenant_id`,`price_list_item_id`,`effective_from`),
  CONSTRAINT `FK_9633388e9e1b8ef475e952b7189` FOREIGN KEY (`price_list_item_id`) REFERENCES `tbl_price_list_item` (`price_list_item_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_c29c59c5febf8be3af85ef3691c` FOREIGN KEY (`created_by`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_e6f54ecf29952459240634cf7ed` FOREIGN KEY (`ended_by`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_f7141b9c6cc88bb50a0dcaa2c8e` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `sku` varchar(100) NOT NULL,
  `product_name` varchar(255) NOT NULL,
  `description` text,
  `product_type` varchar(50) NOT NULL DEFAULT 'STOCK',
  `category_id` bigint NOT NULL,
  `brand_id` bigint DEFAULT NULL,
  `base_unit_id` bigint NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `is_sellable` tinyint NOT NULL DEFAULT '1',
  `is_purchasable` tinyint NOT NULL DEFAULT '1',
  `is_stock_item` tinyint NOT NULL DEFAULT '1',
  `track_batch` tinyint NOT NULL DEFAULT '0',
  `track_expiry` tinyint NOT NULL DEFAULT '0',
  `track_serial` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `uq_product_tenant_sku` (`tenant_id`,`sku`),
  KEY `FK_7080caee3439a41b0ba8fcd74fe` (`category_id`),
  KEY `FK_d3995a58fac02258f74df3b7b27` (`brand_id`),
  KEY `FK_d4413b8cd5d70bbb86301c3eceb` (`base_unit_id`),
  CONSTRAINT `FK_7080caee3439a41b0ba8fcd74fe` FOREIGN KEY (`category_id`) REFERENCES `tbl_category` (`category_id`),
  CONSTRAINT `FK_d3995a58fac02258f74df3b7b27` FOREIGN KEY (`brand_id`) REFERENCES `tbl_brand` (`brand_id`),
  CONSTRAINT `FK_d4413b8cd5d70bbb86301c3eceb` FOREIGN KEY (`base_unit_id`) REFERENCES `tbl_unit_of_measure` (`unit_id`),
  CONSTRAINT `FK_fb5d91db374bede50a824d4664c` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_attributes` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_attribute_id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `attribute_id` bigint NOT NULL,
  `value` varchar(500) NOT NULL,
  PRIMARY KEY (`product_attribute_id`),
  KEY `FK_dccd83bf9a856a6c0ea15a681ce` (`product_id`),
  KEY `FK_2429e249917d4377f5ee4180b3d` (`attribute_id`),
  CONSTRAINT `FK_2429e249917d4377f5ee4180b3d` FOREIGN KEY (`attribute_id`) REFERENCES `tbl_attribute` (`attribute_id`),
  CONSTRAINT `FK_dccd83bf9a856a6c0ea15a681ce` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_identifier` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_identifier_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `identifier_type_id` bigint NOT NULL,
  `identifier_value` varchar(100) NOT NULL,
  `normalized_identifier_value` varchar(100) NOT NULL,
  `is_primary` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `valid_from` datetime DEFAULT NULL,
  `valid_to` datetime DEFAULT NULL,
  `product_unit_id` bigint DEFAULT NULL,
  PRIMARY KEY (`product_identifier_id`),
  UNIQUE KEY `uq_product_identifier_tenant_normalized` (`tenant_id`,`normalized_identifier_value`),
  KEY `FK_9ec6ed6c4523fcffe8c6adeb255` (`product_id`),
  KEY `FK_d77948af40a2e97023c7a550d66` (`identifier_type_id`),
  KEY `idx_product_identifier_product_unit` (`product_unit_id`),
  CONSTRAINT `FK_9ec6ed6c4523fcffe8c6adeb255` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`),
  CONSTRAINT `FK_d77948af40a2e97023c7a550d66` FOREIGN KEY (`identifier_type_id`) REFERENCES `tbl_identifier_type` (`identifier_type_id`),
  CONSTRAINT `fk_product_identifier_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_product_identifier_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_image` (
  `product_image_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `image_url` varchar(2048) NOT NULL,
  `file_name` varchar(255) DEFAULT NULL,
  `alt_text` varchar(255) DEFAULT NULL,
  `display_order` int NOT NULL DEFAULT '0',
  `is_primary` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`product_image_id`),
  KEY `idx_product_image_tenant_product` (`tenant_id`,`product_id`,`is_active`),
  KEY `idx_product_image_product` (`product_id`),
  CONSTRAINT `fk_product_image_product` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_image_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_location` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_location_id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `is_sellable` tinyint NOT NULL DEFAULT '1',
  `is_purchasable` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`product_location_id`),
  UNIQUE KEY `uq_product_location_product_location` (`product_id`,`location_id`),
  KEY `FK_2ca796b99a9571876c96d849dd9` (`location_id`),
  CONSTRAINT `FK_2727d2f5bcf546e50562fe611fd` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`),
  CONSTRAINT `FK_2ca796b99a9571876c96d849dd9` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_supplier` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_supplier_id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `supplier_id` bigint NOT NULL,
  `is_primary_supplier` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`product_supplier_id`),
  UNIQUE KEY `uq_product_supplier_product_supplier` (`product_id`,`supplier_id`),
  KEY `FK_ba7412d209bde54118b7ca57e12` (`supplier_id`),
  CONSTRAINT `FK_ba7412d209bde54118b7ca57e12` FOREIGN KEY (`supplier_id`) REFERENCES `tbl_supplier` (`supplier_id`),
  CONSTRAINT `FK_e48bd403a124ce793a68904a0fd` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_supplier_price` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_supplier_price_id` bigint NOT NULL AUTO_INCREMENT,
  `purchase_price` decimal(18,4) NOT NULL,
  `currency_code` varchar(3) NOT NULL DEFAULT 'LKR',
  `minimum_quantity` decimal(18,6) NOT NULL DEFAULT '1.000000',
  `effective_from` datetime NOT NULL,
  `effective_to` datetime DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `product_supplier_unit_id` bigint NOT NULL,
  PRIMARY KEY (`product_supplier_price_id`),
  KEY `idx_supplier_price_supplier_unit_effective_context` (`product_supplier_unit_id`,`currency_code`,`minimum_quantity`,`effective_from`),
  CONSTRAINT `fk_supplier_price_supplier_unit` FOREIGN KEY (`product_supplier_unit_id`) REFERENCES `tbl_product_supplier_unit` (`product_supplier_unit_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_supplier_unit` (
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `product_supplier_unit_id` bigint NOT NULL AUTO_INCREMENT,
  `product_supplier_id` bigint NOT NULL,
  `product_unit_id` bigint NOT NULL,
  `supplier_product_code` varchar(100) DEFAULT NULL,
  `minimum_order_qty` decimal(18,6) DEFAULT NULL,
  `lead_time_days` int DEFAULT NULL,
  `is_default_purchase_unit` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`product_supplier_unit_id`),
  UNIQUE KEY `uq_product_supplier_unit_supplier_unit` (`product_supplier_id`,`product_unit_id`),
  KEY `fk_product_supplier_unit_product_unit` (`product_unit_id`),
  CONSTRAINT `fk_product_supplier_unit_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_product_supplier_unit_supplier` FOREIGN KEY (`product_supplier_id`) REFERENCES `tbl_product_supplier` (`product_supplier_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_product_unit` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `product_unit_id` bigint NOT NULL AUTO_INCREMENT,
  `product_id` bigint NOT NULL,
  `unit_id` bigint NOT NULL,
  `conversion_factor` decimal(18,6) NOT NULL DEFAULT '1.000000',
  `is_base_unit` tinyint NOT NULL DEFAULT '0',
  `is_purchase_unit` tinyint NOT NULL DEFAULT '0',
  `is_sales_unit` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`product_unit_id`),
  UNIQUE KEY `uq_product_unit_product_unit` (`product_id`,`unit_id`),
  KEY `FK_7f5d738d40000c8ad85433bc015` (`unit_id`),
  CONSTRAINT `FK_0f79a33c60720d3314620a0ec77` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`),
  CONSTRAINT `FK_7f5d738d40000c8ad85433bc015` FOREIGN KEY (`unit_id`) REFERENCES `tbl_unit_of_measure` (`unit_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_purchase_order` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `purchase_order_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `po_number` varchar(50) NOT NULL,
  `supplier_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `order_date` date NOT NULL,
  `expected_date` date DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'DRAFT',
  `currency_code` varchar(3) NOT NULL DEFAULT 'LKR',
  `notes` text,
  `created_by_user_id` bigint NOT NULL,
  `approved_by_user_id` bigint DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `cancelled_by_user_id` bigint DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`purchase_order_id`),
  UNIQUE KEY `IDX_26b08c1de5530938e6343c358f` (`tenant_id`,`po_number`),
  KEY `FK_c4b74c3dfb66fc84e5b5ed48a6b` (`supplier_id`),
  KEY `FK_413a037ceff462417ef5b97f51d` (`location_id`),
  KEY `FK_eadbee39d8ea871578f8eaf593c` (`created_by_user_id`),
  KEY `FK_ddcd3b8ae30fc278ad33d16d98c` (`approved_by_user_id`),
  KEY `FK_3f80820116ebb0fa600852a9e01` (`cancelled_by_user_id`),
  CONSTRAINT `FK_3f80820116ebb0fa600852a9e01` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `FK_413a037ceff462417ef5b97f51d` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_c4b74c3dfb66fc84e5b5ed48a6b` FOREIGN KEY (`supplier_id`) REFERENCES `tbl_supplier` (`supplier_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_ddcd3b8ae30fc278ad33d16d98c` FOREIGN KEY (`approved_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `FK_eadbee39d8ea871578f8eaf593c` FOREIGN KEY (`created_by_user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_f3465219ae571b9d609740e6261` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_purchase_order_line` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `purchase_order_line_id` bigint NOT NULL AUTO_INCREMENT,
  `purchase_order_id` bigint NOT NULL,
  `product_id` bigint NOT NULL,
  `unit_id` bigint NOT NULL,
  `ordered_qty` decimal(18,4) NOT NULL,
  `unit_cost` decimal(18,4) NOT NULL,
  `discount_amount` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `tax_amount` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `net_unit_cost` decimal(18,4) NOT NULL,
  `line_total` decimal(18,4) NOT NULL,
  `received_qty` decimal(18,4) NOT NULL DEFAULT '0.0000',
  `status` varchar(30) NOT NULL DEFAULT 'OPEN',
  `notes` text,
  `source_supplier_price_id` bigint DEFAULT NULL,
  `product_unit_id` bigint DEFAULT NULL,
  `conversion_factor_snapshot` decimal(18,6) DEFAULT NULL,
  `cost_override_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`purchase_order_line_id`),
  KEY `FK_9460fa2e2bc5912f38231258fa7` (`purchase_order_id`),
  KEY `FK_e5524fe055ba6dc9aea125b3145` (`product_id`),
  KEY `FK_8fb032db4d252ff764dc5393121` (`unit_id`),
  KEY `idx_purchase_order_line_source_supplier_price` (`source_supplier_price_id`),
  KEY `idx_purchase_order_line_product_unit` (`product_unit_id`),
  CONSTRAINT `FK_8fb032db4d252ff764dc5393121` FOREIGN KEY (`unit_id`) REFERENCES `tbl_unit_of_measure` (`unit_id`) ON DELETE RESTRICT,
  CONSTRAINT `FK_9460fa2e2bc5912f38231258fa7` FOREIGN KEY (`purchase_order_id`) REFERENCES `tbl_purchase_order` (`purchase_order_id`) ON DELETE CASCADE,
  CONSTRAINT `FK_e5524fe055ba6dc9aea125b3145` FOREIGN KEY (`product_id`) REFERENCES `tbl_product` (`product_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_purchase_order_line_product_unit` FOREIGN KEY (`product_unit_id`) REFERENCES `tbl_product_unit` (`product_unit_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_purchase_order_line_source_supplier_price` FOREIGN KEY (`source_supplier_price_id`) REFERENCES `tbl_product_supplier_price` (`product_supplier_price_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_role` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `role_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_system_role` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `access_scope` varchar(20) NOT NULL DEFAULT 'TENANT',
  PRIMARY KEY (`role_id`),
  KEY `FK_b3587510ea94fcb64d76be48291` (`tenant_id`),
  CONSTRAINT `FK_b3587510ea94fcb64d76be48291` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_role_permission` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `role_permission_id` bigint NOT NULL AUTO_INCREMENT,
  `role_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL,
  `assigned_at` datetime NOT NULL,
  PRIMARY KEY (`role_permission_id`),
  KEY `FK_62b7c849d4bd48853d89527d833` (`role_id`),
  KEY `FK_a8a566876119550f0027f2fde9d` (`permission_id`),
  CONSTRAINT `FK_62b7c849d4bd48853d89527d833` FOREIGN KEY (`role_id`) REFERENCES `tbl_role` (`role_id`),
  CONSTRAINT `FK_a8a566876119550f0027f2fde9d` FOREIGN KEY (`permission_id`) REFERENCES `tbl_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_supplier` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `supplier_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `supplier_code` varchar(50) NOT NULL,
  `supplier_name` varchar(200) NOT NULL,
  `contact_name` varchar(150) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `address_line1` varchar(255) DEFAULT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `mobile` varchar(50) DEFAULT NULL,
  `district_or_state` varchar(100) DEFAULT NULL,
  `postal_code` varchar(30) DEFAULT NULL,
  `country_code` varchar(2) DEFAULT NULL,
  PRIMARY KEY (`supplier_id`),
  UNIQUE KEY `uq_supplier_tenant_code` (`tenant_id`,`supplier_code`),
  CONSTRAINT `FK_fa4f9693325cabbfa3b4d3cc2d1` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_supplier_address` (
  `supplier_address_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `supplier_id` bigint NOT NULL,
  `address_type` varchar(20) NOT NULL,
  `address_line1` varchar(255) NOT NULL,
  `address_line2` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `district_or_state` varchar(100) DEFAULT NULL,
  `postal_code` varchar(30) DEFAULT NULL,
  `country_code` varchar(2) DEFAULT NULL,
  `is_primary` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `active_primary_supplier_id` bigint GENERATED ALWAYS AS ((case when ((`is_primary` = 1) and (`is_active` = 1)) then `supplier_id` else NULL end)) STORED,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`supplier_address_id`),
  UNIQUE KEY `uq_supplier_address_active_primary` (`active_primary_supplier_id`),
  KEY `idx_supplier_address_tenant_supplier` (`tenant_id`,`supplier_id`),
  KEY `fk_supplier_address_supplier` (`supplier_id`),
  CONSTRAINT `fk_supplier_address_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `tbl_supplier` (`supplier_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_supplier_address_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_supplier_contact` (
  `supplier_contact_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `supplier_id` bigint NOT NULL,
  `contact_name` varchar(150) NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `mobile` varchar(50) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `is_primary` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `active_primary_supplier_id` bigint GENERATED ALWAYS AS ((case when ((`is_primary` = 1) and (`is_active` = 1)) then `supplier_id` else NULL end)) STORED,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`supplier_contact_id`),
  UNIQUE KEY `uq_supplier_contact_active_primary` (`active_primary_supplier_id`),
  KEY `idx_supplier_contact_tenant_supplier` (`tenant_id`,`supplier_id`),
  KEY `fk_supplier_contact_supplier` (`supplier_id`),
  CONSTRAINT `fk_supplier_contact_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `tbl_supplier` (`supplier_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_supplier_contact_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_tenant` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `tenant_id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(50) NOT NULL,
  `name` varchar(150) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `allow_direct_grn` tinyint NOT NULL DEFAULT '1',
  `po_required_for_grn` tinyint NOT NULL DEFAULT '0',
  `legal_name` varchar(200) DEFAULT NULL,
  `registration_number` varchar(100) DEFAULT NULL,
  `tax_registration_number` varchar(100) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `address_line1` varchar(200) DEFAULT NULL,
  `address_line2` varchar(200) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state_province` varchar(100) DEFAULT NULL,
  `postal_code` varchar(30) DEFAULT NULL,
  `country_code` varchar(2) DEFAULT NULL,
  `logo_url` varchar(500) DEFAULT NULL,
  `time_zone` varchar(64) NOT NULL DEFAULT 'Asia/Colombo',
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `IDX_f53f627dc5719b1053c8882843` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_tenant_module` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `tenant_module_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `module_id` bigint NOT NULL,
  `is_enabled` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`tenant_module_id`),
  UNIQUE KEY `IDX_570d1a534b753022ceb7d18253` (`tenant_id`,`module_id`),
  KEY `FK_fc7aa345fe6b6e8b153988840e9` (`module_id`),
  CONSTRAINT `FK_89c69312bc0c829b9187637c07a` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`),
  CONSTRAINT `FK_fc7aa345fe6b6e8b153988840e9` FOREIGN KEY (`module_id`) REFERENCES `tbl_module` (`module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_unit_of_measure` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `unit_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  `symbol` varchar(20) DEFAULT NULL,
  `unit_type` varchar(50) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `allows_decimal_quantity` tinyint(1) NOT NULL DEFAULT '0',
  `quantity_precision` tinyint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`unit_id`),
  KEY `FK_9f601a8a07f580ab2640eaaeced` (`tenant_id`),
  CONSTRAINT `FK_9f601a8a07f580ab2640eaaeced` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_user` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `user_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `username` varchar(100) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `mobile` varchar(30) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  KEY `FK_2b210a1e4b578b36673111d3ddd` (`tenant_id`),
  CONSTRAINT `FK_2b210a1e4b578b36673111d3ddd` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_user_location` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `user_location_id` bigint NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `location_id` bigint NOT NULL,
  `is_default` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`user_location_id`),
  UNIQUE KEY `IDX_4464e38130b33e568164ca7a92` (`tenant_id`,`user_id`,`location_id`),
  KEY `FK_3751ef5d9b157a6febfda406fc7` (`user_id`),
  KEY `FK_75b4d92f77cbadd3f41c3b18296` (`location_id`),
  CONSTRAINT `FK_3751ef5d9b157a6febfda406fc7` FOREIGN KEY (`user_id`) REFERENCES `tbl_user` (`user_id`) ON DELETE CASCADE,
  CONSTRAINT `FK_75b4d92f77cbadd3f41c3b18296` FOREIGN KEY (`location_id`) REFERENCES `tbl_location` (`location_id`),
  CONSTRAINT `FK_f90f0d0685dfcad3fb5b8fa7a1c` FOREIGN KEY (`tenant_id`) REFERENCES `tbl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_user_role` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `user_role_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `role_id` bigint NOT NULL,
  `assigned_at` datetime NOT NULL,
  PRIMARY KEY (`user_role_id`),
  KEY `FK_1fa75e81a15d9c9e209512e7b36` (`user_id`),
  KEY `FK_af1013265f131b7cc915704824b` (`role_id`),
  CONSTRAINT `FK_1fa75e81a15d9c9e209512e7b36` FOREIGN KEY (`user_id`) REFERENCES `tbl_user` (`user_id`),
  CONSTRAINT `FK_af1013265f131b7cc915704824b` FOREIGN KEY (`role_id`) REFERENCES `tbl_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `tbl_user_session` (
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `user_session_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `session_token_hash` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `last_activity_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_session_id`),
  UNIQUE KEY `IDX_d19d3291470ace6fe3d5b20581` (`session_token_hash`),
  KEY `FK_25fc3da8b2947417c8c7cda2d03` (`user_id`),
  CONSTRAINT `FK_25fc3da8b2947417c8c7cda2d03` FOREIGN KEY (`user_id`) REFERENCES `tbl_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO migrations (timestamp, name) VALUES (1770000000000, 'ExpandNumberSequenceScope1770000000000');

INSERT INTO migrations (timestamp, name) VALUES (1770000001000, 'ProductPriceHistoryIndexes1770000001000');

INSERT INTO migrations (timestamp, name) VALUES (1770000002000, 'ExtendTenantsAndLocations1770000002000');

INSERT INTO migrations (timestamp, name) VALUES (1770000003000, 'EnhanceSupplierMasterData1770000003000');

INSERT INTO migrations (timestamp, name) VALUES (1770000004000, 'SimplifySupplierDirectDetails1770000004000');

INSERT INTO migrations (timestamp, name) VALUES (1770000005000, 'ProductPriceRemovalAndSnapshots1770000005000');

INSERT INTO migrations (timestamp, name) VALUES (1770000006000, 'AddProductImages1770000006000');

INSERT INTO migrations (timestamp, name) VALUES (1770000007000, 'EnforceTenantProductIdentifierUniqueness1770000007000');

INSERT INTO migrations (timestamp, name) VALUES (1770000008000, 'ProductRelationshipIntegrityAndUnitSnapshots1770000008000');

INSERT INTO migrations (timestamp, name) VALUES (1770000009000, 'SellingPriceProductUnitContext1770000009000');

INSERT INTO migrations (timestamp, name) VALUES (1770000010000, 'BaseUnitOnlySellingMvp1770000010000');

INSERT INTO migrations (timestamp, name) VALUES (1770000011000, 'ProductIdentifierProductUnit1770000011000');

INSERT INTO migrations (timestamp, name) VALUES (1770000012000, 'ReconcileSkuNumberSequences1770000012000');

INSERT INTO migrations (timestamp, name) VALUES (1770000013000, 'AddProductSupplierUnits1770000013000');

INSERT INTO migrations (timestamp, name) VALUES (1770000014000, 'BackfillProductSupplierUnits1770000014000');

INSERT INTO migrations (timestamp, name) VALUES (1770000015000, 'LinkSupplierPricesToSupplierUnits1770000015000');

INSERT INTO migrations (timestamp, name) VALUES (1770000016000, 'FinalizeProductSupplierUnitModel1770000016000');

INSERT INTO migrations (timestamp, name) VALUES (1770000017000, 'AddPriceListItemDiscounts1770000017000');

INSERT INTO migrations (timestamp, name) VALUES (1770000018000, 'HardenPoGrnInventoryPosting1770000018000');

INSERT INTO migrations (timestamp, name) VALUES (1770000019000, 'AddTenantTimeZone1770000019000');

INSERT INTO migrations (timestamp, name) VALUES (1770000020000, 'AddGoodsReceiptReversal1770000020000');

INSERT INTO migrations (timestamp, name) VALUES (1770000021000, 'AddInventoryAdjustments1770000021000');

INSERT INTO migrations (timestamp, name) VALUES (1770000022000, 'AddInventoryAdjustmentStockSnapshots1770000022000');

INSERT INTO migrations (timestamp, name) VALUES (1770000023000, 'AddInventoryConversions1770000023000');

SET FOREIGN_KEY_CHECKS=1;
