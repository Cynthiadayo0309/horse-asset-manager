from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def main() -> int:
    errors: list[str] = []
    markdown_files = sorted(DOCS.glob("*.md"))
    if len(markdown_files) != 14:
        errors.append(f"expected 14 markdown files in docs, found {len(markdown_files)}")

    link_pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    replacement = "\ufffd"
    mojibake_markers = ("縺", "繧", "蜿", "荳", "逕", "謗")
    all_text = ""
    for path in markdown_files:
        text = path.read_text(encoding="utf-8")
        all_text += "\n" + text
        if replacement in text:
            errors.append(f"replacement character found: {path.relative_to(ROOT)}")
        marker_count = sum(text.count(marker) for marker in mojibake_markers)
        if marker_count >= 3:
            errors.append(f"possible mojibake ({marker_count} markers): {path.relative_to(ROOT)}")
        if not text.startswith("# "):
            errors.append(f"missing H1 at start: {path.relative_to(ROOT)}")
        for link in link_pattern.findall(text):
            if link.startswith(("http://", "https://", "#")):
                continue
            target = link.split("#", 1)[0]
            if not target:
                continue
            resolved = (path.parent / target).resolve()
            if not resolved.exists():
                errors.append(f"broken link in {path.name}: {link}")

    required_ids = {
        "FR-AUTH-001",
        "FR-HORSE-005",
        "FR-CF-001",
        "FR-SCH-002",
        "FR-BUD-002",
        "FR-ANA-003",
        "FR-SET-002",
        "FR-PDF-001",
        "NFR-SEC-001",
        "NFR-PRV-001",
        "NFR-REL-002",
        "NFR-COST-001",
    }
    for requirement_id in sorted(required_ids):
        if requirement_id not in all_text:
            errors.append(f"missing requirement id: {requirement_id}")

    expected_outputs = [
        DOCS / "Horse_Asset_Manager_設計資料一式.docx",
        DOCS / "assets" / "architecture-overview.png",
        DOCS / "assets" / "financial-data-flow.png",
        DOCS / "assets" / "data-model-overview.png",
    ]
    for output in expected_outputs:
        if not output.exists() or output.stat().st_size == 0:
            errors.append(f"missing or empty output: {output.relative_to(ROOT)}")

    if errors:
        print("DOCUMENT VALIDATION FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"DOCUMENT VALIDATION OK: {len(markdown_files)} Markdown files and 4 artifacts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
