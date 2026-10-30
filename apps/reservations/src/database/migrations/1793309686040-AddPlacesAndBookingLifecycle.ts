import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Introduces places and the pending → confirmed / failed / cancelled booking
 * lifecycle. Generated, then edited by hand so that existing rows survive:
 * the generated version dropped `timestamp` outright and would have left
 * every existing reservation as `pending`.
 */
export class AddPlacesAndBookingLifecycle1793309686040
  implements MigrationInterface
{
  name = 'AddPlacesAndBookingLifecycle1793309686040';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`place\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(255) NOT NULL, \`description\` text NULL, \`pricePerNightCents\` int NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`placeId\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`status\` varchar(16) NOT NULL DEFAULT 'pending'`,
    );
    // Every reservation before this migration was created only after its
    // charge succeeded.
    await queryRunner.query(
      `UPDATE \`reservation\` SET \`status\` = 'confirmed'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`amountCents\` int NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`refundId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`idempotencyKey\` varchar(255) NULL`,
    );

    // `timestamp` becomes `createdAt`; copied across before it is dropped.
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`,
    );
    await queryRunner.query(
      `UPDATE \`reservation\` SET \`createdAt\` = \`timestamp\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`timestamp\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)`,
    );

    // Pending reservations exist before they have been charged.
    await queryRunner.query(
      `ALTER TABLE \`reservation\` CHANGE \`invoiceId\` \`invoiceId\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_ce1deb75876f1b0d77a978998c\` ON \`reservation\` (\`userId\`, \`idempotencyKey\`)`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD CONSTRAINT \`FK_1512ed8c16233c17af299fafccb\` FOREIGN KEY (\`placeId\`) REFERENCES \`place\`(\`id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP FOREIGN KEY \`FK_1512ed8c16233c17af299fafccb\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_ce1deb75876f1b0d77a978998c\` ON \`reservation\``,
    );
    // Uncharged attempts cannot be represented in the old schema, which
    // required an invoice id on every row.
    await queryRunner.query(
      `DELETE FROM \`reservation\` WHERE \`invoiceId\` IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` CHANGE \`invoiceId\` \`invoiceId\` varchar(255) NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`reservation\` ADD \`timestamp\` datetime NULL`,
    );
    await queryRunner.query(
      `UPDATE \`reservation\` SET \`timestamp\` = \`createdAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` MODIFY \`timestamp\` datetime NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`updatedAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`createdAt\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`idempotencyKey\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`refundId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`amountCents\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`status\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`reservation\` DROP COLUMN \`placeId\``,
    );
    await queryRunner.query(`DROP TABLE \`place\``);
  }
}
