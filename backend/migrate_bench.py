"""
Migration script: adds missing columns to the bench table.
Runs safely - skips columns that already exist.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def run():
    db_url = os.getenv("DATABASE_URL", "").strip()
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    migrations = [
        ("bench_days_assigned", "ALTER TABLE bench ADD COLUMN bench_days_assigned INTEGER;"),
        ("secondary_skill",     "ALTER TABLE bench ADD COLUMN secondary_skill TEXT;"),
        ("third_skill",         "ALTER TABLE bench ADD COLUMN third_skill TEXT;"),
    ]

    for col, sql in migrations:
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'bench' AND column_name = %s;
        """, (col,))
        if cursor.fetchone():
            print(f"Column '{col}' already exists. Skipping.")
        else:
            cursor.execute(sql)
            conn.commit()
            print(f"Migration successful: added '{col}' to bench table.")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()
