#!/bin/bash
echo "Setting up AQSoft Health Platform..."
echo "Waiting for PostgreSQL..."
sleep 3
echo "Running migrations..."
cd /app && alembic upgrade head
echo "Seeding data..."
python -m scripts.seed
echo "Done! Login with demo@aqsoft.ai / demo123"
