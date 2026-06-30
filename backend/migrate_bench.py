"""
Migration script: adds bench_days_assigned column to the bench table.
Runs safely with IF NOT EXISTS logic via information_schema check.
"""
from database import connect_to_retool

def run():
    conn = connect_to_retool()
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
