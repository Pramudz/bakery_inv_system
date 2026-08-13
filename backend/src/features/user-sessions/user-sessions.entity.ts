import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../common/audit.entity';
import { User } from '../users/user.entity';
@Entity('tbl_user_session')
export class UserSession extends AuditEntity {
  @PrimaryGeneratedColumn({ name:'user_session_id', type:'bigint' }) userSessionId!: number;
  @Column({ name:'user_id', type:'bigint' }) userId!: number;
  @ManyToOne(() => User, (user) => user.sessions, { nullable:false })
  @JoinColumn({ name:'user_id' }) user!: User;
  @Column({ name:'session_token_hash', type:'varchar', length:255, unique:true }) sessionTokenHash!: string;
  @Column({ name:'ip_address', type:'varchar', length:45, nullable:true }) ipAddress!: string|null;
  @Column({ name:'user_agent', type:'varchar', length:500, nullable:true }) userAgent!: string|null;
  @Column({ name:'expires_at', type:'datetime' }) expiresAt!: Date;
  @Column({ name:'last_activity_at', type:'datetime', nullable:true }) lastActivityAt!: Date|null;
  @Column({ name:'revoked_at', type:'datetime', nullable:true }) revokedAt!: Date|null;
}
