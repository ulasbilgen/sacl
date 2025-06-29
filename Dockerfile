FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S sacl && \
    adduser -S sacl -u 1001

# Set permissions
RUN chown -R sacl:sacl /app
USER sacl

# Expose port (if using HTTP transport)
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('SACL MCP Server Health Check')" || exit 1

# Start the server
CMD ["npm", "start"]