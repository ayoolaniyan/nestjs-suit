import { IsEmail, IsStrongPassword } from 'class-validator';

// Roles are deliberately absent: this DTO backs a public signup endpoint, and
// anything listed here can be set by the caller. The global ValidationPipe
// runs with `whitelist`, so a `roles` field in the body is stripped.
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsStrongPassword()
  password: string;
}
