import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

export abstract class AuditEntity {
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt!: Date | null;
}
