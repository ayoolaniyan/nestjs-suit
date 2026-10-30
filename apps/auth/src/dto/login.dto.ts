// Documentation only: LocalStrategy reads these fields from the body itself,
// so the handler has no @Body() for Swagger to infer the schema from.
export class LoginDto {
  email: string;
  password: string;
}
