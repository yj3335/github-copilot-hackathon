FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY apps/landing-page/package.json ./apps/landing-page/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "landing-page-server"]
