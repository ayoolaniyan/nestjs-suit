# nestjs-suit

A NestJS monorepo of four services — **auth**, **reservations**, **payments**
and **notifications** — communicating over TCP, sharing a `libs/common`
package, and deployed to Kubernetes via Helm.

## Provenance

This started as the "Sleepr" project from Michael Guay's NestJS microservices
course, which I worked through to get hands-on with Nest's monorepo mode and
its microservice transports. I have kept it as a working sandbox rather than
a finished product, and the structure of the four services still follows the
course.

What is mine, beyond the course material:

- **Migrated persistence from MongoDB/Mongoose to MySQL with TypeORM**,
  including rewriting `AbstractRepository` against `Repository` and
  `EntityManager`.
- **Added role-based authorisation** — a `Role` entity, a many-to-many
  relation to `User`, and role checking inside the shared `JwtAuthGuard`.
- **Added a health module** exposed by each service, and Kubernetes ingress.
- **Added Helm charts** for all four services and a Google Cloud Build
  pipeline that builds and pushes each image.
- **Fixed a set of real defects** and added the unit tests below that pin
  them. Those are described in the next section, because they are the part
  worth talking about.

I would rather say all this up front than have someone recognise the course
structure and wonder what else was not mentioned.

## Defects found and fixed

Each of these is covered by a test, so they cannot come back quietly.

**Tokens were signed with the wrong secret.** `AuthModule` configured
`JwtModule` with `configService.get('JW_SECRET')` — missing the `T`. The
lookup returned `undefined`, so every token was signed with an empty secret
while `JwtStrategy` verified against `JWT_SECRET`. Login looked like it
worked and every authenticated request afterwards failed.

**Header-based authentication never worked.** Both the shared guard and the
JWT strategy read `headers.Authentication`. Node lower-cases incoming header
names, so that was always `undefined` and only cookie-carried tokens were
ever accepted.

**The base repository's logger was never assigned.** `AbstractRepository`
declared `protected readonly logger: Logger` without initialising it. Any
subclass that did not shadow it would throw a `TypeError` from inside the
"entity not found" path — masking the `NotFoundException` it was about to
raise with an unrelated crash.

**Seven runtime dependencies were missing from `package.json`.** `bcryptjs`,
`stripe`, `nodemailer`, `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt` and
`passport-local` were all imported but never declared, so a clean clone could
not build. Two declared dependencies (`mongoose`, `@nestjs/mongoose`) were
left over from before the TypeORM migration and are gone.

**Config validation described a database that is no longer used.** The shared
`ConfigModule` required `MONGODB_URI`; it now validates the MySQL settings
the services actually connect with.

**`synchronize` was driven by a string.** `MYSQL_SYNCHRONIZE=false` is the
string `'false'`, which is truthy — so TypeORM schema synchronisation was
enabled whenever the variable was set at all. It is now an explicit
comparison and is additionally refused when `NODE_ENV=production`.

**Deletes reported success whether or not anything was deleted.**
`findOneAndDelete` ignored the affected-row count; it now raises
`NotFoundException`, matching the behaviour of `findOneAndUpdate`.

Also removed: `console.log` of request payloads and tokens in the auth
controller and reservations service, four unmodified Nest scaffold e2e specs
that asserted `"Hello World!"` against services that never returned it, and
npm scripts pointing at a `dist/apps/sleepr` path that does not exist.

## Services

| Service | Transport | Responsibility |
| --- | --- | --- |
| `auth` | HTTP + TCP | Login, user management, token issuing; answers `authenticate` over TCP |
| `reservations` | HTTP | Reservation CRUD; calls `payments` to create a charge |
| `payments` | TCP | Stripe charge creation; emits `notify_email` |
| `notifications` | TCP | Sends email via nodemailer |

`libs/common` holds what they share: the abstract entity and repository, the
JWT guard, the `@CurrentUser` decorator, config, logging and health modules.

## Running it

```bash
cp .env.example .env    # then fill in the values
pnpm install
docker compose up
```

## Tests

```bash
pnpm test        # unit tests
pnpm run lint
pnpm run typecheck
pnpm run test:e2e   # builds the images and runs the suite against compose
```

Unit tests and the type check run on every push via GitHub Actions. The e2e
suite needs Docker and the four service images, so it is run locally.

## Deployment

Helm charts for each service live under `k8s/nestjs-suit`, with a shared
ingress. `cloudbuild.yaml` builds and pushes the four production images to
Artifact Registry.

## Licence

MIT
