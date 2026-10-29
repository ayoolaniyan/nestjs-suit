ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine

WORKDIR /usr/src/app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD [ "pnpm", "test" ]
