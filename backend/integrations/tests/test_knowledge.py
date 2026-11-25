import json
import sqlite3
from contextlib import closing

import pytest

from backend.ai.knowledge_catalog import question_outcome, suggested_factors
from backend.integrations.branches import _connect
from backend.integrations.knowledge_store import knowledge_entries


@pytest.mark.parametrize(("question", "outcome", "first_factor"), [
    ("Can energy drinks shorten my sleep?", "sleep_min", "caffeine_pm"),
    ("Wake up after scrolling at night", "sleep_min", "screen_late_min"),
    ("I keep getting migraines after walking", "headache", "steps"),
    ("Can less walking affect my mood?", "mood", "steps"),
    ("Is a late bedtime linked to my headaches?", "headache", "lights_out"),
    ("Why am I groggy after lunch?", "afternoon_energy", "sleep_min"),
    ("Why did my step count drop after poor sleep?", "steps", "sleep_min"),
    ("Why do I get thirsty when I exercise?", "water_ml", "steps"),
    ("Why am I scrolling at night after coffee?", "screen_late_min", "caffeine_pm"),
    ("Why do I go to bed late after using my phone?", "lights_out", "screen_late_min"),
    ("Why do I drink more coffee after sleeping badly?", "caffeine_pm", "sleep_min"),
    ("Why cant i piss properly?", "urinary_symptoms", None),
    ("Why does this app crash?", "untracked", None),
])
def test_question_catalog(question, outcome, first_factor):
    assert question_outcome(question) == outcome
    factors = suggested_factors(question, outcome)
    assert (factors[0] if factors else None) == first_factor
    assert outcome not in factors


def test_existing_resolutions_are_backfilled_once(monkeypatch, tmp_path):
    path = tmp_path / "workspace.db"
    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(path))
    with closing(sqlite3.connect(path)) as conn, conn:
        conn.execute("""
            CREATE TABLE workspace_branches (
                sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, payload TEXT NOT NULL
            )
        """)
        for lifecycle in ("resolved", "dissolved", "open"):
            conn.execute("INSERT INTO workspace_branches(id, user_id, payload) VALUES (?, ?, ?)", (
                lifecycle, "owner", json.dumps({
                    "title": "Did walking affect mood?", "lifecycle": lifecycle,
                    "closed_date": "2026-11-20", "resolution": "Local observation.",
                }),
            ))

    for _ in range(2):
        with closing(_connect()) as conn:
            assert knowledge_entries(conn, "owner") == [{
                "id": "resolved", "topic": "mood", "title": "Did walking affect mood?",
                "date": "2026-11-20", "note": "Local observation.",
            }]
            assert knowledge_entries(conn, "other") == []
