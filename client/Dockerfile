# -------------------
# Stage 1: Build
# -------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then npm install -g pnpm && pnpm install; \
  else echo "No lock file found." && exit 1; fi

# Copy project files and build
COPY . .
RUN npm run build

# -------------------
# Stage 2: Production
# -------------------
FROM nginx:alpine AS production

# Copy built assets to NGINX public dir
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config if available
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
