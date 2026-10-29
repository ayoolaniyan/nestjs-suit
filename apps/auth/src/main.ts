import { NestFactory, Reflector } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AuthModule);
  const configService = app.get(ConfigService);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  // Applies @Exclude() on entities, so the password hash never leaves the
  // service in a response.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useLogger(app.get(Logger));
  // Registered after the globals above, and with inheritAppConfig, so the TCP
  // `authenticate` reply is serialised the same way as HTTP responses.
  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: { host: '0.0.0.0', port: configService.get<number>('TCP_PORT') },
    },
    { inheritAppConfig: true },
  );
  await app.startAllMicroservices();
  await app.listen(configService.get<number>('HTTP_PORT'));
}
bootstrap();
