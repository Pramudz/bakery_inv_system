import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('tbl_platform_user')
export class PlatformUser {
  @PrimaryGeneratedColumn({
    name: 'platform_user_id',
    type: 'bigint',
  })
  platformUserId!: number;

  @Column({
    name: 'username',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  username!: string;

  @Column({
    name: 'email',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  email!: string | null;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({
    name: 'first_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  firstName!: string | null;

  @Column({
    name: 'last_name',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  lastName!: string | null;

  @Column({
    name: 'mobile',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  mobile!: string | null;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: true,
  })
  isActive!: boolean;

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date;
}