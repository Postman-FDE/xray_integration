FROM node:24-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma/
COPY prisma.config.ts ./
RUN npx prisma generate

COPY src ./src/

EXPOSE 3003

CMD npx prisma db push && node --experimental-strip-types src/server.js
