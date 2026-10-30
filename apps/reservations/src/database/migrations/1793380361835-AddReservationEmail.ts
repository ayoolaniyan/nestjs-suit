import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReservationEmail1793380361835 implements MigrationInterface {
  name = 'AddReservationEmail1793380361835';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`email\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`email\``,
    );
  }
}
