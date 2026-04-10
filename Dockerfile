FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src ./src

RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "test -n \"$DATABASE_URL\" || { echo 'DATABASE_URL is not configured in Railway service variables.'; exit 1; }; npx prisma migrate deploy && node dist/server.js"]
