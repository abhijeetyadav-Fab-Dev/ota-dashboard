#!/bin/bash
# Migration script for OTA Dashboard
# Usage: ./migrate.sh <DATABASE_URL>

set -e

if [ -z "$1" ]; then
    echo "Usage: ./migrate.sh <DATABASE_URL>"
    echo "Example: ./migrate.sh 'postgresql://postgres:password@db.xxx.supabase.co:5432/postgres'"
    exit 1
fi

export DATABASE_URL="$1"
export SESSION_SECRET="$(openssl rand -base64 32)"

echo "=== OTA Dashboard Migration ==="
echo "Database: ${DATABASE_URL%@*@*}@***"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Push schema to database (quick sync, no migration history)
echo "Pushing schema to database..."
npx prisma db push --accept-data-loss

# Create a demo admin user if none exists
echo "Creating admin user..."
npx prisma db execute --stdin <<'EOF'
INSERT INTO users (id, username, passwordHash, name, role, active, "createdAt")
SELECT 'user_admin_1', 'admin', '$2b$10$/xPJxWaZgPZ0SKyRLUSQ/OhQbKmp.7BltjTR4i3D7y0Hy4VwapTky', 'Admin', 'admin', true, NOW()::text
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
EOF

echo ""
echo "=== Migration Complete ==="
echo "SESSION_SECRET: $SESSION_SECRET"
echo ""
echo "Add these to your .env.local:"
echo "DATABASE_URL=$DATABASE_URL"
echo "SESSION_SECRET=$SESSION_SECRET"
