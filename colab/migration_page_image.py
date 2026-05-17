"""
migration_page_image.py

Paste the ENTIRE contents of this cell into Colab and run it.
It discovers the correct DB path automatically, then adds the new column.
"""
import sqlite3, os, sys

# ── 1. Figure out the actual DB path ─────────────────────────────────────────
# Try env var first (set by the Colab startup cell)
db_url = os.environ.get("DATABASE_URL", "")

def url_to_path(url: str) -> str:
    """Convert sqlite:///... URL to a filesystem path."""
    if url.startswith("sqlite:////"):      # absolute path  sqlite:////abs/path
        return url[len("sqlite:///"):]
    if url.startswith("sqlite:///"):       # relative path  sqlite:///./rel
        return url[len("sqlite:///"):]
    return url

candidates = []
if db_url:
    candidates.append(url_to_path(db_url))

# Common Colab/Drive locations
candidates += [
    "/content/drive/MyDrive/ComicStudio/storage/comic_studio.db",
    "/content/drive/MyDrive/ComicStudio/comic_studio.db",
    "/content/comic_studio.db",
    "./comic_studio.db",
]

db_path = None
for c in candidates:
    if os.path.exists(c):
        db_path = c
        break

if db_path is None:
    print("❌ Could not find comic_studio.db in any expected location.")
    print(f"   Tried: {candidates}")
    print(f"   DATABASE_URL env = {db_url!r}")
    print()
    print("   Fix: run the FastAPI startup cells first (A1→A5), then re-run this.")
    raise FileNotFoundError("comic_studio.db not found")

print(f"✅ Found DB at: {db_path}")

# ── 2. List tables ────────────────────────────────────────────────────────────
con = sqlite3.connect(db_path)
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print(f"   Tables: {tables}")

if "comic_pages" not in tables:
    con.close()
    print()
    print("❌ Table 'comic_pages' not found in this DB.")
    print("   The FastAPI server's init_db() hasn't run yet against this file.")
    print("   → Restart the Colab server cells, then re-run this script.")
    raise RuntimeError("comic_pages table missing — run init_db first")

# ── 3. Add missing columns ────────────────────────────────────────────────────
cur.execute("PRAGMA table_info(comic_pages)")
existing_cols = {r[1] for r in cur.fetchall()}
print(f"   Existing columns: {sorted(existing_cols)}")

to_add = {
    "page_image_path": "VARCHAR(500)",
}

for col, typedef in to_add.items():
    if col not in existing_cols:
        cur.execute(f"ALTER TABLE comic_pages ADD COLUMN {col} {typedef}")
        con.commit()
        print(f"   ✅ Added column: {col} {typedef}")
    else:
        print(f"   ℹ️  Column '{col}' already exists — skipping.")

con.close()
print()
print("Migration complete. Restart the FastAPI server to pick up the changes.")
