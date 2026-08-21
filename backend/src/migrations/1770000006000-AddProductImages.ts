import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImages1770000006000 implements MigrationInterface {
  name = 'AddProductImages1770000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tbl_product_image')) return;
    await queryRunner.query(`
      CREATE TABLE tbl_product_image (
        product_image_id bigint NOT NULL AUTO_INCREMENT,
        tenant_id bigint NOT NULL,
        product_id bigint NOT NULL,
        image_url varchar(2048) NOT NULL,
        file_name varchar(255) NULL,
        alt_text varchar(255) NULL,
        display_order int NOT NULL DEFAULT 0,
        is_primary tinyint NOT NULL DEFAULT 0,
        is_active tinyint NOT NULL DEFAULT 1,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (product_image_id),
        INDEX idx_product_image_tenant_product (tenant_id, product_id, is_active),
        INDEX idx_product_image_product (product_id),
        CONSTRAINT fk_product_image_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_tenant(tenant_id) ON DELETE RESTRICT,
        CONSTRAINT fk_product_image_product FOREIGN KEY (product_id) REFERENCES tbl_product(product_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('tbl_product_image'))
      await queryRunner.dropTable('tbl_product_image');
  }
}
