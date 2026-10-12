# Build from the repository root so the canonical handbook content is available:
# docker build -f 01-frontend/handbuch/Dockerfile -t spark-handbuch .

# Stage 1: Build the static handbook
FROM node:24-alpine3.23 AS builder

WORKDIR /app/01-frontend/handbuch

# Install dependencies before copying source files to preserve the dependency layer.
COPY 01-frontend/handbuch/package.json 01-frontend/handbuch/pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Keep the repository layout expected by the Waku and Fumapress configuration.
COPY 01-frontend/handbuch/ ./
COPY docs/handbuch/ /app/docs/handbuch/

RUN pnpm run build

# Stage 2: Serve the static output with Nginx
FROM nginx:1.30.5-alpine3.24-slim

# Temporary guard until upstream nginx alpine image refreshes vulnerable Alpine packages
RUN apk add --no-cache --upgrade \
    'libexpat>=2.8.2-r0' \
    'libpng>=1.6.56-r0' \
    'musl>=1.2.5-r23' \
    'musl-utils>=1.2.5-r23'

COPY --from=builder /app/01-frontend/handbuch/dist/public /usr/share/nginx/html
COPY 01-frontend/handbuch/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
