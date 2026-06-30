import sys
import psycopg2

AZURE_URL = (
    "postgresql://azureuser:Valuemomentum123"
    "@agent-marketplace.postgres.database.azure.com:5432/ops-bot"
    "?sslmode=require"
)

conn = psycopg2.connect(AZURE_URL)
cur = conn.cursor()

tables = ["bench", "rrf", "allocation_table", "associates_directory"]
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    sys.stdout.write(f"{t}: {cur.fetchone()[0]} rows\n")

# Verify bench data quality
cur.execute("""
    SELECT COUNT(*) FROM bench
    WHERE tsc = 'Platform, App & Infra' AND bench_days_assigned > 0
""")
sys.stdout.write(f"bench BB (Platform TSC, bench_days>0): {cur.fetchone()[0]}\n")

cur.execute("""
    SELECT COUNT(*) FROM bench
    WHERE tsc = 'Platform, App & Infra' AND (bench_days_assigned IS NULL OR bench_days_assigned = 0)
""")
sys.stdout.write(f"bench Allocated (Platform TSC, no bench days): {cur.fetchone()[0]}\n")

sys.stdout.flush()
cur.close()
conn.close()
