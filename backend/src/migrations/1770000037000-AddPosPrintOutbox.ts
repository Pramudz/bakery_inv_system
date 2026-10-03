import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPosPrintOutbox1770000037000 implements MigrationInterface {
  name = 'AddPosPrintOutbox1770000037000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE tbl_pos_print_profile (
      pos_print_profile_id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id bigint NOT NULL, location_id bigint NOT NULL, pos_terminal_id bigint NULL,
      scope_key varchar(30) NOT NULL, display_name varchar(100) NOT NULL,
      transport varchar(20) NOT NULL, target varchar(255) NOT NULL, port int unsigned NULL,
      paper_width int unsigned NOT NULL, encoding varchar(30) NOT NULL, cut_enabled tinyint(1) NOT NULL,
      agent_token_hash char(64) NOT NULL, is_active tinyint(1) NOT NULL DEFAULT 1,
      created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_pos_print_profile_scope (tenant_id, location_id, scope_key),
      KEY ix_pos_print_profile_terminal (tenant_id, pos_terminal_id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE tbl_pos_print_job (
      pos_print_job_id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id bigint NOT NULL, location_id bigint NOT NULL, pos_terminal_id bigint NULL,
      pos_print_profile_id bigint NOT NULL, document_type varchar(10) NOT NULL, source_id bigint NULL,
      receipt_snapshot json NOT NULL, status varchar(20) NOT NULL DEFAULT 'PENDING',
      attempts int unsigned NOT NULL DEFAULT 0, lease_until datetime(3) NULL,
      last_error varchar(500) NULL, created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_pos_print_job_document (pos_print_profile_id, document_type, source_id),
      KEY ix_pos_print_job_queue (pos_print_profile_id, status, pos_print_job_id),
      CONSTRAINT fk_pos_print_job_profile FOREIGN KEY (pos_print_profile_id) REFERENCES tbl_pos_print_profile (pos_print_profile_id)
    ) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE tbl_pos_receipt_reprint (
      pos_receipt_reprint_id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenant_id bigint NOT NULL, location_id bigint NOT NULL,
      document_type varchar(10) NOT NULL, source_id bigint NOT NULL,
      requested_by_user_id bigint NOT NULL, requested_at datetime(3) NOT NULL,
      print_job_id bigint NULL,
      KEY ix_pos_receipt_reprint_document (tenant_id, document_type, source_id)
    ) ENGINE=InnoDB`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE tbl_pos_receipt_reprint');
    await q.query('DROP TABLE tbl_pos_print_job');
    await q.query('DROP TABLE tbl_pos_print_profile');
  }
}
