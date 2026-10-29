import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the role that @Roles('Admin') checks for. Signup cannot grant it,
 * so an admin is made by linking a user to this role:
 *
 *   INSERT INTO user_roles_role (userId, roleId)
 *   SELECT <user id>, id FROM role WHERE name = 'Admin';
 */
export class SeedAdminRole1793306644522 implements MigrationInterface {
  name = 'SeedAdminRole1793306644522';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO \`role\` (\`name\`) VALUES ('Admin')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`role\` WHERE \`name\` = 'Admin'`);
  }
}
