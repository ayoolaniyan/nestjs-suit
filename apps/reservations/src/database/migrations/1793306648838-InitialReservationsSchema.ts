import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialReservationsSchema1793306648838
  implements MigrationInterface
{
  name = 'InitialReservationsSchema1793306648838';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`reservation\` (\`id\` int NOT NULL AUTO_INCREMENT, \`timestamp\` datetime NOT NULL, \`startDate\` datetime NOT NULL, \`endDate\` datetime NOT NULL, \`userId\` int NOT NULL, \`invoiceId\` varchar(255) NOT NULL, INDEX \`IDX_529dceb01ef681127fef04d755\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_529dceb01ef681127fef04d755\` ON \`reservation\``,
    );
    await queryRunner.query(`DROP TABLE \`reservation\``);
  }
}
