# Stage 1: Build frontend
FROM node:22-bookworm-slim AS build

WORKDIR /app

# Native module build dependencies (better-sqlite3)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:22-bookworm-slim

WORKDIR /app

# Native module runtime dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove build tools after native modules are compiled
RUN apt-get remove -y python3 make gcc g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/vite.config.ts ./
COPY --from=build /app/index.html ./
COPY --from=build /app/public ./public

# Persistent data directory
RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/knowledge.db

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
