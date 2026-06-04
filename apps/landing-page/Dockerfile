FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/extension/package.json ./apps/extension/package.json
COPY apps/landing-page/package.json ./apps/landing-page/package.json
COPY packages/pdf-core/package.json ./packages/pdf-core/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "landing-page-server"]
