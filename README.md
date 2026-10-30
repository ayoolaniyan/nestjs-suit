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
- **Added Helm charts** for all four services and an AWS CodeBuild pipeline
  that builds and pushes each image to ECR.
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
`ConfigModule` required `MONGODB_URI`. The MySQL settings the services
actually connect with are now validated in each database-backed service's
own config schema, and the unused shared module is gone.

**`synchronize` was driven by a string.** `MYSQL_SYNCHRONIZE=false` is the
string `'false'`, which is truthy — so TypeORM schema synchronisation was
enabled whenever the variable was set at all. It was first made an explicit
comparison refused in production, and has since been removed altogether in
favour of migrations (see Database below).

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
| `reservations` | HTTP | Places, availability, booking and cancellation; calls `payments` to charge and refund |
| `payments` | TCP | Stripe charges and refunds; emits `notify_email` |
| `notifications` | TCP | Sends email via nodemailer |

`libs/common` holds what they share: the abstract entity and repository, the
JWT guard, the `@CurrentUser` decorator, logging, health, metrics, request
context and Swagger setup.

## Booking

Admins list **places**, each with a nightly price in cents. Anyone can browse
them and ask for availability; a signed-in user books one for whole nights.

| Endpoint | Who | |
| --- | --- | --- |
| `POST /places`, `PATCH /places/:id` | admin | list or change a place |
| `GET /places`, `GET /places/:id` | anyone | browse |
| `GET /places/:id/availability?from=&to=` | anyone | booked stays in a window (dates only, never who) |
| `POST /reservations` | user | book `{ placeId, startDate, endDate, paymentMethodId }` |
| `GET /reservations`, `GET /reservations/:id` | user | own reservations (all, for an admin) |
| `POST /reservations/:id/cancel` | owner | cancel before check-in, refunded in full |
| `DELETE /reservations/:id` | admin | delete the record, no refund |

Rules worth knowing:

- **The server prices the stay** (nights × nightly rate). The client never
  sends an amount. Money is whole cents everywhere.
- **Dates are calendar dates** (`YYYY-MM-DD`), 1–30 nights, not starting in
  the past. Check-out day is free for the next check-in.
- **No double-booking.** A booking is first saved as `pending` inside a
  transaction that locks the place row and checks for overlaps, and only then
  charged. A pending booking holds its dates for 15 minutes. A declined card
  marks it `failed` and frees the dates; a timeout leaves it pending, since
  the charge may have gone through.
- **Retries are safe** with an `Idempotency-Key` header: a repeat returns the
  confirmed booking, or retries a pending one's charge under the same Stripe
  idempotency key, so the card is never charged twice.

## Observability

- **Request ids.** Every HTTP response carries `x-request-id` (the caller's,
  if it sent a well-formed one). The id is forwarded over TCP and appears as
  `requestId` on every log line it causes, in every service, so one search
  follows a request from reservations through auth and payments.
- **Metrics.** auth and reservations serve Prometheus metrics at `/metrics`
  (not routed by the ingress): `http_request_duration_seconds` by route
  template, `rpc_client_duration_seconds` by message pattern and outcome
  (which is how payments' latency is measured), and process metrics.
- **API docs.** OpenAPI at `/reservations/docs` and `/auth/docs` (JSON at
  `…/docs-json`). On by default outside production; set `SWAGGER_ENABLED`
  (Helm: `swaggerEnabled`) to change that.

## Running it

```bash
cp .env.example .env    # shared settings; fill in the blanks
for svc in auth reservations payments notifications; do
  cp apps/$svc/.env.example apps/$svc/.env   # each service's own port
done
docker compose up
```

Ports: reservations `3000` (HTTP), auth `3001` (HTTP) and `3002` (TCP),
payments `3003` (TCP), notifications `3004` (TCP). `/health` (liveness) and
`/health/ready` (database ping) are served by auth and reservations.

## Database

The schema is managed by TypeORM migrations, never `synchronize`. Each
database-backed service applies its own migrations at startup and records
them in its own table (`migrations_auth`, `migrations_reservations`), so the
two never race over the same migration.

After changing an entity, generate a migration against a running database and
add it to that service's `src/database/migrations/index.ts`:

```bash
MYSQL_HOST=localhost pnpm typeorm:auth migration:generate \
  apps/auth/src/database/migrations/DescribeTheChange
```

(`typeorm:reservations` for the reservations service. The scripts read `.env`;
variables already set in the shell take precedence.)

**Making an admin.** Signup cannot grant roles, and only an admin can list
places. The `Admin` role is created by
a migration; link a user to it directly:

```sql
INSERT INTO user_roles_role (userId, roleId)
SELECT <user id>, id FROM role WHERE name = 'Admin';
```

## Tests

```bash
pnpm test           # unit tests
pnpm run lint
pnpm run typecheck
pnpm run test:e2e   # builds the production images and runs the suite against them
```

GitHub Actions runs lint, the type check, unit tests and a build of all four
services on every push, then the e2e suite against images built from that
commit with a fresh MySQL, and a Helm lint plus schema validation of the
rendered manifests.

## Deployment

`buildspec.yaml` (AWS CodeBuild) builds the four production images and pushes
them to ECR, tagged with the short commit SHA and `latest`. The Helm chart in
`k8s/nestjs-suit` deploys them to EKS behind an ALB ingress:

```bash
helm upgrade --install nestjs-suit k8s/nestjs-suit \
  --set global.imageRegistry=<account>.dkr.ecr.<region>.amazonaws.com \
  --set global.imageTag=<commit sha> \
  --set mysql.host=<database endpoint> \
  --set notifications.smtpUser=<sender address> \
  --set notifications.googleOAuthClientId=<client id>
```

The chart expects these Secrets to exist: `mysql` (`username`, `password`),
`jwt` (`jwtSecret`), `stripe` (`apiKey`) and `google` (`clientSecret`,
`refreshToken`). See `values.yaml` for everything else.

## Licence

MIT
