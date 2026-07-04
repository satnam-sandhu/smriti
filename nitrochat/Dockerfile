# Multi-stage build for NitroChat Next.js application

# ---------------------------
# Stage 1: Dependencies
# ---------------------------
FROM public.ecr.aws/docker/library/node:20-alpine3.22 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci


# ---------------------------
# Stage 2: Builder
# ---------------------------
FROM public.ecr.aws/docker/library/node:20-alpine3.22 AS builder
WORKDIR /app

# ✅ Cache busting (IMPORTANT)
ARG CACHE_BUST
RUN echo "Build cache bust: $CACHE_BUST"

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build


# ---------------------------
# Stage 3: Production runner
# ---------------------------
FROM public.ecr.aws/docker/library/node:20-alpine3.22 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Copy built Next.js app
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Start app
CMD ["npm", "start"]