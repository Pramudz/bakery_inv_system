import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PlatformUser } from '../platform-users/platform-users.entity';

@Entity('tbl_platform_session')
export class PlatformSession {
  @PrimaryGeneratedColumn({
    name: 'platform_session_id',
    type: 'bigint',
  })
  platformSessionId!: number;

  @Column({
    name: 'platform_user_id',
    type: 'bigint',
  })
  platformUserId!: number;

  @ManyToOne(
    () => PlatformUser,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'platform_user_id',
  })
  platformUser!: PlatformUser;

  @Column({
    name: 'session_token_hash',
    type: 'varchar',
    length: 255,
    unique: true,
  })
  sessionTokenHash!: string;

  @Column({
    name: 'expires_at',
    type: 'datetime',
  })
  expiresAt!: Date;

  @Column({
    name: 'last_activity_at',
    type: 'datetime',
  })
  lastActivityAt!: Date;

  @Column({
    name: 'revoked_at',
    type: 'datetime',
    nullable: true,
  })
  revokedAt!: Date | null;

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;
}