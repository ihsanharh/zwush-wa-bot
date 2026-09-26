FROM oven/bun:debian

WORKDIR /app

# Install ca-certificates and fonts for Sharp SVG poster rendering
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json bun.lock* tsconfig.json ./

# Install dependencies
RUN bun install

# Copy application source
COPY src ./src
COPY index.ts ./

# Create directory for persistent WhatsApp authentication
RUN mkdir -p /app/.auth

# Default environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    CORE_API_URL="http://zwush-core:3000"

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
