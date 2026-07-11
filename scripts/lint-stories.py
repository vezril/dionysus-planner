#!/usr/bin/env python3
"""Layer-zero mechanical gate for story files (docs/stories/S-*.md).

Checks structure, reference resolvability, and traceability before any
LLM/human readiness review runs. Exit 1 on any error; warnings don't fail.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STORIES = ROOT / "docs" / "stories"
PRD = ROOT / "docs" / "prd.md"
EPICS = ROOT / "docs" / "epics.md"

REQUIRED_SECTIONS = ["## Context", "## Acceptance Criteria", "## Tasks", "## Dev Notes"]
# MUST-have FRs per PRD §8
MUST_FRS = (
    [f"FR-{n}" for n in [1, 2, 3, 4]]
    + [f"FR-{n}" for n in range(6, 12)]
    + [f"FR-{n}" for n in range(13, 16)]
    + [f"FR-{n}" for n in range(17, 23)]
    + ["FR-24", "FR-25", "FR-28", "FR-29"]
)
SHOULD_FRS = ["FR-5", "FR-12", "FR-16", "FR-23", "FR-26", "FR-27"]

errors, warnings = [], []


def err(f, msg):
    errors.append(f"{f}: {msg}")


def warn(f, msg):
    warnings.append(f"{f}: {msg}")


prd_text = PRD.read_text()
prd_ids = set(re.findall(r"\b(?:FR|NFR|UJ|NG|A|OQ)-\d+\b", prd_text))

story_files = sorted(STORIES.glob("S-*.md"))
story_ids = {f.name.split("-")[0] + "-" + f.name.split("-")[1] for f in story_files}

covered = set()

for f in story_files:
    text = f.read_text()
    name = f.name
    sid = "-".join(name.split("-")[:2])

    # Title line matches filename ID
    m = re.match(r"# (S-\d+):", text)
    if not m:
        err(name, "missing '# S-XXX: <title>' heading")
    elif m.group(1) != sid:
        err(name, f"heading ID {m.group(1)} != filename ID {sid}")

    # Header metadata
    if not re.search(r"\*\*Epic:\*\* E-\d", text):
        err(name, "missing '**Epic:** E-X' metadata")
    if not re.search(r"\*\*Status:\*\*", text):
        err(name, "missing '**Status:**' metadata")
    dep_m = re.search(r"\*\*Depends on:\*\* ([^\n|]+)", text)
    if not dep_m:
        err(name, "missing '**Depends on:**' metadata")
    else:
        deps = re.findall(r"S-\d+", dep_m.group(1))
        if not deps and "none" not in dep_m.group(1).lower():
            err(name, f"unparseable Depends on: {dep_m.group(1).strip()!r}")
        for d in deps:
            if d not in story_ids:
                err(name, f"depends on {d}, which has no story file")
            if d == sid:
                err(name, "story depends on itself")

    # Covers traceability
    cov_m = re.search(r"\*\*Covers:\*\* ([^\n]+)", text)
    if not cov_m:
        err(name, "missing '**Covers:**' line")
    else:
        ids = re.findall(r"\b(?:FR|NFR|UJ|NG|A)-\d+\b", cov_m.group(1))
        if not ids:
            err(name, "Covers line names no PRD IDs")
        for i in ids:
            if i not in prd_ids:
                err(name, f"Covers {i}, which does not exist in prd.md")
        covered.update(ids)

    # Required sections
    for s in REQUIRED_SECTIONS:
        if s not in text:
            err(name, f"missing section '{s}'")

    # AC grammar: numbered, Given/When/Then
    ac_block = re.split(r"## Acceptance Criteria", text)
    if len(ac_block) > 1:
        ac_text = re.split(r"\n## ", ac_block[1])[0]
        numbered = re.findall(r"^\s*\d+\.", ac_text, re.M)
        if not numbered:
            err(name, "Acceptance Criteria has no numbered items")
        for kw in ("Given", "When", "Then"):
            if kw.lower() not in ac_text.lower():
                err(name, f"Acceptance Criteria never uses '{kw}'")

    # Tasks: checklist items; TEST before matching IMPL overall
    task_block = re.split(r"## Tasks", text)
    if len(task_block) > 1:
        t_text = re.split(r"\n## ", task_block[1])[0]
        boxes = re.findall(r"^\s*- \[ \] (TEST|IMPL)?", t_text, re.M)
        if not re.search(r"^\s*- \[ \]", t_text, re.M):
            err(name, "Tasks section has no '- [ ]' checklist items")
        tags = re.findall(r"- \[ \] (TEST|IMPL):", t_text)
        if "IMPL" in tags and "TEST" in tags:
            if tags.index("IMPL") < tags.index("TEST"):
                warn(name, "first IMPL task precedes first TEST task (check TDD order)")
        elif "IMPL" in tags and "TEST" not in tags:
            warn(name, "has IMPL tasks but no TEST tasks (infra-only story?)")

# Cross-set traceability: every MUST FR covered
for fr in MUST_FRS:
    if fr not in covered:
        errors.append(f"TRACEABILITY: MUST requirement {fr} is covered by no story")
for fr in SHOULD_FRS:
    if fr not in covered:
        warnings.append(f"TRACEABILITY: SHOULD requirement {fr} is covered by no story")

# epics.md mentions every story
if EPICS.exists():
    epics_text = EPICS.read_text()
    for s in sorted(story_ids):
        if s not in epics_text:
            errors.append(f"epics.md: story {s} not referenced in the index")
else:
    errors.append("docs/epics.md missing")

print(f"Linted {len(story_files)} story files.")
for w in warnings:
    print(f"WARN  {w}")
for e in errors:
    print(f"ERROR {e}")
print(f"\n{len(errors)} error(s), {len(warnings)} warning(s).")
sys.exit(1 if errors else 0)
