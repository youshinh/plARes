# ---- Build Stage: Node ----
FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

COPY shared ./shared
COPY frontend ./frontend

WORKDIR /app/frontend
RUN npm run build

# ---- Runtime Stage: Nginx ----
FROM nginx:1.27-alpine

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built app
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
