"""Reassemble the dictionary index uploaded as GitHub-sized chunks."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
data = ROOT / "data"
target = data / "dictionary.sqlite3"
parts = sorted(data.glob("dictionary.sqlite3.part-*"))
if parts:
    expected = [data / f"dictionary.sqlite3.part-{i:02d}" for i in range(len(parts))]
    if parts != expected:
        raise SystemExit(f"Dictionary chunks are incomplete: {parts}")
    with target.open("wb") as output:
        for part in parts:
            with part.open("rb") as source:
                while block := source.read(1024 * 1024):
                    output.write(block)
    print(f"Reassembled {target.stat().st_size:,} bytes from {len(parts)} chunks")
else:
    print("Dictionary index already present")
