import { EntityManager } from 'typeorm';

/** Counter rows are created and locked inside the document transaction. */
export async function nextPosReceiptNumber(
  manager: EntityManager,
  kind: 'SALE' | 'REFUND',
  tenantId: number,
  businessDate: string,
  locationCode: string,
  registerCode = '',
): Promise<number> {
  await manager.query(
    `INSERT INTO tbl_pos_receipt_counter
       (kind, tenant_id, business_date, location_code, register_code, last_number)
     VALUES (?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE last_number = last_number`,
    [kind, tenantId, businessDate, locationCode, registerCode],
  );
  const rows: Array<{ last_number: number }> = await manager.query(
    `SELECT last_number FROM tbl_pos_receipt_counter
     WHERE kind = ? AND tenant_id = ? AND business_date = ? AND location_code = ? AND register_code = ? FOR UPDATE`,
    [kind, tenantId, businessDate, locationCode, registerCode],
  );
  const number = Number(rows[0].last_number) + 1;
  await manager.query(
    `UPDATE tbl_pos_receipt_counter SET last_number = ?
     WHERE kind = ? AND tenant_id = ? AND business_date = ? AND location_code = ? AND register_code = ?`,
    [number, kind, tenantId, businessDate, locationCode, registerCode],
  );
  return number;
}
