from __future__ import annotations

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

from backend.agents.storyteller.templates.seed_templates import seed_phase4_templates
from backend.db.session import SessionLocal, create_tables


def main() -> None:
    create_tables()
    db = SessionLocal()
    try:
        templates = seed_phase4_templates(db)
        print(f"Seeded {len(templates)} Phase 4 prompt templates.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
