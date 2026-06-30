"""
Migration script: adds bench_days_assigned column to the bench table.
Runs safely with IF NOT EXISTS logic via information_schema check.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def run():
    db_url = os.getenv("DATABASE_URL", "").strip()
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    # Check if column already exists
    cursor.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'bench' AND column_name = 'bench_days_assigned';
    """)
    exists = cursor.fetchone()

    if exists:
        print("Column 'bench_days_assigned' already exists. Nothing to do.")
    else:
        cursor.execute("ALTER TABLE bench ADD COLUMN bench_days_assigned INTEGER;")
        conn.commit()
        print("Migration successful: added 'bench_days_assigned' column to bench table.")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()
