import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuotations1770000040000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE tbl_quotation (
      quotation_id BIGINT NOT NULL AUTO_INCREMENT, tenant_id BIGINT NOT NULL, location_id BIGINT NOT NULL,
      customer_id BIGINT NOT NULL, quotation_number VARCHAR(50) NOT NULL, quotation_date DATE NOT NULL,
      valid_until DATE NOT NULL, status VARCHAR(20) NOT NULL, quotation_type VARCHAR(20) NOT NULL,
      subtotal DECIMAL(18,2) NOT NULL, discount_total DECIMAL(18,2) NOT NULL, grand_total DECIMAL(18,2) NOT NULL,
      notes TEXT NULL, terms_and_conditions TEXT NULL,
      customer_name_snapshot VARCHAR(200) NOT NULL, customer_code_snapshot VARCHAR(50) NOT NULL,
      customer_phone_snapshot VARCHAR(50) NULL, customer_email_snapshot VARCHAR(150) NULL,
      customer_address_snapshot TEXT NULL, location_code_snapshot VARCHAR(50) NOT NULL,
      location_name_snapshot VARCHAR(150) NOT NULL, created_by_user_id BIGINT NOT NULL,
      updated_by_user_id BIGINT NULL, sent_at DATETIME NULL, sent_by_user_id BIGINT NULL,
      accepted_at DATETIME NULL, accepted_by_user_id BIGINT NULL,
      rejected_at DATETIME NULL, rejected_by_user_id BIGINT NULL,
      cancelled_at DATETIME NULL, cancelled_by_user_id BIGINT NULL,
      converted_at DATETIME NULL, converted_by_user_id BIGINT NULL, converted_invoice_id BIGINT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (quotation_id), UNIQUE KEY uq_quotation_tenant_number (tenant_id, quotation_number),
      UNIQUE KEY uq_quotation_converted_invoice (converted_invoice_id),
      KEY ix_quotation_tenant_location_date (tenant_id, location_id, quotation_date),
      KEY ix_quotation_customer (customer_id), KEY ix_quotation_created_by (created_by_user_id),
      CONSTRAINT fk_quotation_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id),
      CONSTRAINT fk_quotation_location FOREIGN KEY (location_id) REFERENCES tbl_location(location_id),
      CONSTRAINT fk_quotation_customer FOREIGN KEY (customer_id) REFERENCES tbl_customer(customer_id),
      CONSTRAINT fk_quotation_created_by FOREIGN KEY (created_by_user_id) REFERENCES tbl_user(user_id),
      CONSTRAINT fk_quotation_invoice FOREIGN KEY (converted_invoice_id) REFERENCES tbl_invoice(invoice_id)
    ) ENGINE=InnoDB`);
    await queryRunner.query(`CREATE TABLE tbl_quotation_line (
      quotation_line_id BIGINT NOT NULL AUTO_INCREMENT, quotation_id BIGINT NOT NULL,
      line_number INT NOT NULL, product_id BIGINT NOT NULL,
      product_code_snapshot VARCHAR(100) NOT NULL, product_name_snapshot VARCHAR(255) NOT NULL,
      unit_id BIGINT NOT NULL, unit_code_snapshot VARCHAR(30) NOT NULL, unit_name_snapshot VARCHAR(100) NOT NULL,
      quantity DECIMAL(18,4) NOT NULL, list_price DECIMAL(18,2) NOT NULL,
      unit_price DECIMAL(18,2) NOT NULL, discount_percent DECIMAL(7,4) NOT NULL,
      discount_amount DECIMAL(18,2) NOT NULL, gross_total DECIMAL(18,2) NOT NULL, net_total DECIMAL(18,2) NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (quotation_line_id), UNIQUE KEY uq_quotation_line_number (quotation_id, line_number),
      KEY ix_quotation_line_product (product_id), KEY ix_quotation_line_unit (unit_id),
      CONSTRAINT fk_quotation_line_quotation FOREIGN KEY (quotation_id) REFERENCES tbl_quotation(quotation_id) ON DELETE CASCADE,
      CONSTRAINT fk_quotation_line_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id),
      CONSTRAINT fk_quotation_line_unit FOREIGN KEY (unit_id) REFERENCES tbl_unit_of_measure(unit_id)
    ) ENGINE=InnoDB`);
    await queryRunner.query('ALTER TABLE tbl_invoice ADD COLUMN source_quotation_id BIGINT NULL');
    await queryRunner.query('ALTER TABLE tbl_invoice ADD UNIQUE KEY uq_invoice_source_quotation (source_quotation_id)');
    await queryRunner.query('ALTER TABLE tbl_invoice ADD CONSTRAINT fk_invoice_source_quotation FOREIGN KEY (source_quotation_id) REFERENCES tbl_quotation(quotation_id)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE tbl_invoice DROP FOREIGN KEY fk_invoice_source_quotation');
    await queryRunner.query('ALTER TABLE tbl_invoice DROP INDEX uq_invoice_source_quotation');
    await queryRunner.query('ALTER TABLE tbl_invoice DROP COLUMN source_quotation_id');
    await queryRunner.query('DROP TABLE tbl_quotation_line');
    await queryRunner.query('DROP TABLE tbl_quotation');
  }
}
