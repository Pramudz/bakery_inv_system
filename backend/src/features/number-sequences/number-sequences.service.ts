import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

@Injectable()
export class NumberSequencesService {
  // MySQL implementation.
  // Replace the atomic upsert query if the database engine changes.

  async getNextNumber(
    manager: EntityManager,
    tenantId: number,
    sequenceKey: string,
    scopeKey = 'TENANT',
    periodKey = 'NEVER',
  ): Promise<number> {
    const normalizedSequenceKey = sequenceKey.trim().toUpperCase();

    await manager.query(
      `
        INSERT INTO tbl_number_sequence (
          tenant_id,
          sequence_key,
          scope_key,
          period_key,
          last_number
        )
        VALUES (?, ?, ?, ?, 0)
        ON DUPLICATE KEY UPDATE
          number_sequence_id = number_sequence_id
      `,
      [tenantId, normalizedSequenceKey, scopeKey, periodKey],
    );

    await manager.query(
      `
        UPDATE tbl_number_sequence
        SET last_number = last_number + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ?
          AND sequence_key = ?
          AND scope_key = ?
          AND period_key = ?
      `,
      [tenantId, normalizedSequenceKey, scopeKey, periodKey],
    );

    const result = await manager.query(
      `
        SELECT last_number AS nextNumber
        FROM tbl_number_sequence
        WHERE tenant_id = ?
          AND sequence_key = ?
          AND scope_key = ?
          AND period_key = ?
      `,
      [tenantId, normalizedSequenceKey, scopeKey, periodKey],
    );

    return Number(result[0].nextNumber);
  }

  getTenantNextNumber(
    manager: EntityManager,
    tenantId: number,
    sequenceKey: string,
    periodKey = 'NEVER',
  ) {
    return this.getNextNumber(manager, tenantId, sequenceKey, 'TENANT', periodKey);
  }

  getLocationNextNumber(
    manager: EntityManager,
    tenantId: number,
    sequenceKey: string,
    locationId: number,
    periodKey = 'NEVER',
  ) {
    return this.getNextNumber(manager, tenantId, sequenceKey, `LOCATION:${locationId}`, periodKey);
  }

  getTerminalNextNumber(
    manager: EntityManager,
    tenantId: number,
    sequenceKey: string,
    locationId: number,
    terminalId: number,
    periodKey: string,
  ) {
    return this.getNextNumber(manager, tenantId, sequenceKey, `LOCATION:${locationId}:TERMINAL:${terminalId}`, periodKey);
  }
}
