ARG NODE_VERSION=22.0.0

FROM node:${NODE_VERSION}-alpine As development

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./
COPY tsconfig.json tsconfig.json
COPY nest-cli.json nest-cli.json

RUN npm install -g pnpm

COPY apps/payments apps/payments
COPY libs libs

RUN pnpm install

RUN pnpm run build payments

FROM node:${NODE_VERSION}-alpine as production

ARG NODE_ENV=production
ENV NODE_ENV={NODE_ENV}

WORKDIR /usr/src/app

COPY package.json ./
COPY pnpm-lock.yaml ./

RUN npm install -g pnpm

RUN pnpm install --prod

COPY --from=development /usr/src/app/dist ./dist

CMD [ "node", "dist/apps/payments/main" ]



