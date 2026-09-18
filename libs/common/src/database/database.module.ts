import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql' as const,
        host: configService.getOrThrow<string>('MYSQL_HOST'),
        port: Number(configService.getOrThrow<number>('MYSQL_PORT')),
        database: configService.getOrThrow<string>('MYSQL_DATABASE'),
        username: configService.getOrThrow<string>('MYSQL_ROOT_USERNAME'),
        password: configService.getOrThrow<string>('MYSQL_ROOT_PASSWORD'),
        // Environment variables are strings: the raw value 'false' is truthy,
        // so this previously enabled schema synchronisation whenever the
        // variable was set at all. Synchronisation rewrites tables to match
        // the entities and is never safe in production.
        synchronize:
          configService.get<string>('MYSQL_SYNCHRONIZE') === 'true' &&
          configService.get<string>('NODE_ENV') !== 'production',
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {
  static forFeature(models: EntityClassOrSchema[]) {
    return TypeOrmModule.forFeature(models);
  }
}
