# Stage 1: Build the application
FROM node:24-alpine3.23 AS builder

WORKDIR /app

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Install dependencies (including devDependencies) for build-time tooling
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the application bundle
RUN pnpm run build

# Stage 2: Serve with Nginx
FROM nginx:1.30-alpine3.23-slim

# Temporary guard until upstream nginx alpine image refreshes vulnerable Alpine packages
RUN apk add --no-cache --upgrade \
    'libexpat>=2.7.5-r0' \
    'libpng>=1.6.56-r0' \
    'musl>=1.2.5-r23' \
    'musl-utils>=1.2.5-r23'

# Copy the build output from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Inject runtime config before starting nginx
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["/docker-entrypoint.sh"]
