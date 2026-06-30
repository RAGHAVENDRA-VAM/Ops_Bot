from database import connect_to_retool

conn = connect_to_retool()
cur = conn.cursor()

results = []

cur.execute('SELECT COUNT(*) FROM bench')
results.append(f"bench total rows       : {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM bench WHERE allocation_status = 'BB'")
results.append(f"bench BB status        : {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM bench WHERE vamid IS NOT NULL')
results.append(f"bench with vamid       : {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM bench WHERE bench_days_assigned IS NOT NULL')
results.append(f"bench_days_assigned filled: {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM bench WHERE vam_exp IS NOT NULL')
results.append(f"bench vam_exp filled   : {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM bench WHERE total_exp IS NOT NULL')
results.append(f"bench total_exp filled : {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM rrf')
results.append(f"rrf total rows         : {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM rrf WHERE status = 'Open'")
results.append(f"rrf open               : {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM associates_directory')
results.append(f"associates_directory   : {cur.fetchone()[0]}")

cur.execute('SELECT COUNT(*) FROM allocation_table')
results.append(f"allocation_table       : {cur.fetchone()[0]}")

# Sample bench row
cur.execute('SELECT vamid, name, grade, tsc, workspace, vam_exp, total_exp, bench_days_assigned, allocation_status FROM bench WHERE vamid IS NOT NULL LIMIT 3')
rows = cur.fetchall()
results.append("\nSample bench rows (non-null vamid):")
for r in rows:
    results.append(str(r))

if not rows:
    cur.execute('SELECT * FROM bench LIMIT 3')
    rows = cur.fetchall()
    results.append("\nSample bench rows (raw):")
    for r in rows:
        results.append(str(r))

cur.close()
conn.close()

output = "\n".join(results)
print(output)
with open("db_check_result.txt", "w") as f:
    f.write(output)
