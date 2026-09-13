# Multi-stage build for lean production container
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src

# Build TypeScript to JavaScript
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built distribution from builder stage
COPY --from=builder /app/dist ./dist

# Run as non-root user for security
USER node

# MCP server communicates over standard I/O (stdio)
ENTRYPOINT ["node", "dist/index.js", "serve"]
