import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SwaggerOptions {
  title: string;
  /**
   * Under the service's own ingress prefix (e.g. `reservations/docs`), so the
   * docs are reachable through the shared ALB without colliding.
   */
  path: string;
}

/**
 * Serves OpenAPI docs unless SWAGGER_ENABLED is false. Defaults to on outside
 * production and off in it, so a deployment opts in to publishing its API
 * surface.
 */
export function setupSwagger(
  app: INestApplication,
  { title, path }: SwaggerOptions,
) {
  const configService = app.get(ConfigService);
  const enabled =
    configService.get<boolean>('SWAGGER_ENABLED') ??
    configService.get<string>('NODE_ENV') !== 'production';
  if (!enabled) {
    return;
  }

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle(title)
      .setVersion('1.0')
      .addCookieAuth('Authentication')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: 'authentication' },
        'authentication-header',
      )
      .build(),
  );
  SwaggerModule.setup(path, app, document);
}
