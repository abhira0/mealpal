# ponytail: single stage, full-ish slim image. Multi-stage/standalone saves
# image size but fights better-sqlite3's native binary tracing — not worth it here.
FROM node:22-slim

# build tools in case better-sqlite3 has no prebuilt binary for the arch
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
