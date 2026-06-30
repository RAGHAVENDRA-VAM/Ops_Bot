import sys
import pandas as pd
import re

def normalize(col):
    return re.sub(r'[^a-z0-9]+', '_', str(col).strip().lower()).strip('_')

# Paste the actual PowerBI row keys here (from the logic app payload)
sample_row = {
    "Derived_Allocations[VAMID]": "103132",
    "Derived_Allocations[Name]": "Keerthidhar Janga",
    "Derived_Allocations[VamExp]": 1.887,
    "Derived_Allocations[Grade_Description]": "A4",
    "TSC[Description]": "Risk Analytics",
    "Derived_Allocations[Workspace]": "Palnadu",
    "Derived_Allocations[Account_History_Summary]": "Guard Insurance_01",
    "[SumStatusConcat_with_Days_assigned_BB_modified_]": 378,
    "[SumTotal_Exp]": 6.287
}

df = pd.DataFrame([sample_row])
df.columns = (
    df.columns.str.strip().str.lower()
    .str.replace(r'[^a-z0-9]+', '_', regex=True)
    .str.strip('_')
)

with open("debug_columns.txt", "w") as f:
    f.write("=== Normalized column names arriving from PowerBI ===\n")
    for col in df.columns:
        f.write(f"  '{col}'\n")

    column_map = {
        "derived_allocations_vamid": "vamid",
        "derived_allocations_name": "name",
        "derived_allocations_vamexp": "vam_exp",
        "derived_allocations_grade_description": "grade",
        "tsc_description": "tsc",
        "derived_allocations_workspace": "workspace",
        "derived_allocations_account_history_summary": "accountsummary",
        "derived_allocations_currentskill_d": "currentskill",
        "sumtotal_exp": "total_exp",
        "sumstatusconcat_with_days_assigned_bb_modified": "bench_days_assigned",
        "current_skill": "currentskill",
        "account_summary": "accountsummary",
    }

    f.write("\n=== Column mapping result ===\n")
    for col in df.columns:
        mapped = column_map.get(col, f"(no mapping - stays as '{col}')")
        f.write(f"  '{col}' -> {mapped}\n")

    df_mapped = df.rename(columns=column_map)
    f.write("\n=== After rename, columns ===\n")
    for col in df_mapped.columns:
        f.write(f"  '{col}'\n")

    f.write("\n=== Sample values after mapping ===\n")
    f.write(str(df_mapped.to_dict(orient='records')) + "\n")

print(open("debug_columns.txt").read())
