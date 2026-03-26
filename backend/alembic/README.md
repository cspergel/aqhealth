# Alembic Migrations

For development: use `python -m scripts.setup_db` (drops and recreates everything).

For production (preserving data):
  alembic revision --autogenerate -m "description of change"
  alembic upgrade head

Note: Initial schema creation is handled by setup_db.py, not Alembic.
Alembic is for incremental changes to an existing database.
