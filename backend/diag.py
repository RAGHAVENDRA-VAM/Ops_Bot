import sys
import psycopg2
from dotenv import load_dotenv
import os

load_dotenv()

AZURE_URL = (
    "postgresql://azureuser:Valuemomentum123"
    "@agent-marketplace.postgres.database.azure.com:5432/ops-bot"
    "?sslmode=require"
)

conn = psycopg2.connect(AZURE_URL)
cur = conn.cursor()

cur.execute("SELECT current_database()")
sys.stdout.write("Connected to: " + cur.fetchone()[0] + "\n")

cur.execute("SELECT COUNT(*) FROM bench")
sys.stdout.write("bench total rows: " + str(cur.fetchone()[0]) + "\n")

cur.execute("SELECT DISTINCT tsc FROM bench ORDER BY tsc")
tscs = [r[0] for r in cur.fetchall()]
sys.stdout.write("Distinct TSC values:\n")
for t in tscs:
    sys.stdout.write(f"  repr: {repr(t)}\n")

cur.execute("SELECT COUNT(*) FROM bench WHERE bench_days_assigned > 0")
sys.stdout.write("bench_days_assigned > 0: " + str(cur.fetchone()[0]) + "\n")

cur.execute("SELECT COUNT(*) FROM bench WHERE tsc = 'Platform, App & Infra'")
sys.stdout.write("TSC exact match count: " + str(cur.fetchone()[0]) + "\n")

cur.execute("SELECT COUNT(*) FROM bench WHERE tsc = 'Platform, App & Infra' AND bench_days_assigned > 0")
sys.stdout.write("BB candidates count: " + str(cur.fetchone()[0]) + "\n")

cur.execute("SELECT vamid, name, tsc, bench_days_assigned FROM bench WHERE bench_days_assigned > 0 LIMIT 5")
rows = cur.fetchall()
sys.stdout.write("Sample BB rows:\n")
for r in rows:
    sys.stdout.write(f"  {r}\n")

sys.stdout.flush()
cur.close()
conn.close()
