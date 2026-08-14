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
  ): Promise<number> {
    const normalizedSequenceKey = sequenceKey.trim().toUpperCase();

    await manager.query(
      `
        INSERT INTO tbl_number_sequence (
          tenant_id,
          sequence_key,
          last_number
        )
        VALUES (?, ?, LAST_INSERT_ID(1))
        ON DUPLICATE KEY UPDATE
          last_number = LAST_INSERT_ID(last_number + 1),
          updated_at = CURRENT_TIMESTAMP
      `,
      [tenantId, normalizedSequenceKey],
    );

    const result = await manager.query(
      `SELECT LAST_INSERT_ID() AS nextNumber`,
    );

    return Number(result[0].nextNumber);
  }
}