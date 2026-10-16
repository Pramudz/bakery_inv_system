import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9])[\s\S]+$/, {
    message: 'New password must include uppercase, lowercase, a number, and a symbol.',
  })
  newPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  confirmPassword!: string;
}
