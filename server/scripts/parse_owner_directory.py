"""Parses the 'Owner Directory' sheet of the cleaned owner-directory workbook into JSON
on stdout, for import-owners.ts to upsert into the Unit table. Usage:
  python parse_owner_directory.py <path-to-xlsx>
"""
import sys
import json
import openpyxl


def clean(value):
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    path = sys.argv[1]
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Owner Directory"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))

    units = []
    for row in rows:
        block, apt, reg, owner, phone, email, flags = row
        if not block or not apt:
            continue
        units.append(
            {
                "block": clean(block).replace("Block ", ""),
                "number": clean(apt),
                "registrationNo": clean(reg),
                "ownerName": clean(owner),
                "ownerPhone": clean(phone),
                "ownerEmail": clean(email),
                "dataNotes": clean(flags),
            }
        )

    json.dump(units, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
