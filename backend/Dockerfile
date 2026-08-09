# ── Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generates the Prisma client against this image's platform, not the host's.
RUN npx prisma generate

COPY src ./src/

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Prisma needs OpenSSL on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma/
COPY --from=build /app/src ./src/

# Don't run as root.
USER node

EXPOSE 5001

# The platform's health probe should hit /health, which pings the database.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
