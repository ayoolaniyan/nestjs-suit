ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS development

WORKDIR /usr/src/app

# pnpm at the version pinned by package.json's packageManager field.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Dependencies before source, so a code change does not reinstall them.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json nest-cli.json ./
COPY apps/auth apps/auth
COPY libs libs

RUN pnpm exec nest build auth

FROM node:${NODE_VERSION}-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=development /usr/src/app/dist ./dist

# The official image ships an unprivileged `node` user; run as it, not root.
USER node

CMD [ "node", "dist/apps/auth/main" ]
