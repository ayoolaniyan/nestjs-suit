import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import * as Joi from 'joi';
import { DataSourceOptions } from 'typeorm';

/** Merge into each database-backed service's config validation schema. */
export const databaseValidationSchema = {
  MYSQL_HOST: Joi.string().required(),
  MYSQL_PORT: Joi.number().required(),
  MYSQL_DATABASE: Joi.string().required(),
  MYSQL_USER: Joi.string().required(),
  MYSQL_PASSWORD: Joi.string().required(),
};

export interface DatabaseModuleOptions {
  /**
   * The migrations this service owns. Imported as classes rather than found
   * by glob, because webpack bundles each service into a single file.
   */
  migrations: DataSourceOptions['migrations'];
  /**
   * Each service records its migrations in its own table, so two services
   * starting together never race to apply the same one.
   */
  migrationsTableName: string;
}

export const mysqlConnectionOptions = (configService: ConfigService) => ({
  type: 'mysql' as const,
  host: configService.getOrThrow<string>('MYSQL_HOST'),
  port: Number(configService.getOrThrow<number>('MYSQL_PORT')),
  database: configService.getOrThrow<string>('MYSQL_DATABASE'),
  username: configService.getOrThrow<string>('MYSQL_USER'),
  password: configService.getOrThrow<string>('MYSQL_PASSWORD'),
});

@Module({})
export class DatabaseModule {
  static forRoot({
    migrations,
    migrationsTableName,
  }: DatabaseModuleOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            ...mysqlConnectionOptions(configService),
            autoLoadEntities: true,
            // The schema is changed only by migrations, applied at startup.
            synchronize: false,
            migrations,
            migrationsTableName,
            migrationsRun: true,
          }),
          inject: [ConfigService],
        }),
      ],
    };
  }

  static forFeature(models: EntityClassOrSchema[]) {
    return TypeOrmModule.forFeature(models);
  }
}
