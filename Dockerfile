# Use official Bun image
FROM oven/bun:1-alpine

WORKDIR /app

# Ensure essential directories exist
RUN mkdir -p /app/data /app/public/uploads/icons /app/public/uploads/apks /app/public/uploads/screenshots /app/public/uploads/avatars

# Copy application files
COPY . .

# Expose server port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Run the web server
CMD ["bun", "run", "server.ts"]
