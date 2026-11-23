
from datetime import datetime, timedelta, timezone

from backend.schemas import (
    Observation,
    Branch,
    Evidence,
    Experiment,
    GraphResponse,
    BranchStatus,
    ExperimentStatus,
)


def generate_demo_data():

    now = datetime.now(timezone.utc)

    observations = []

    # Generate 14 days of sleep and energy observations
    for day in range(14):
        recorded_at = now - timedelta(days=13 - day)

        sleep = 7.5 if day < 7 else 5.5
        energy = 8.0 if day < 7 else 5.0

        observations.append(
            Observation(
                id=f"obs_sleep_{day + 1}",
                metric="sleep_duration",
                value=sleep,
                unit="hours",
                recorded_at=recorded_at,
            )
        )

        observations.append(
            Observation(
                id=f"obs_energy_{day + 1}",
                metric="energy_level",
                value=energy,
                unit="score",
                recorded_at=recorded_at,
            )
        )

    branch = Branch(
        id="branch_001",
        title="Afternoon Energy",
        description="Investigating the relationship between sleep and energy.",
        status=BranchStatus.OPEN,
        created_at=now,
    )

    evidence = Evidence(
        id="evidence_001",
        hypothesis_id="hypothesis_001",
        observation_id="obs_sleep_14",
        relationship="supporting",
        explanation="Sleep duration decreased during the same period.",
    )

    experiment = Experiment(
        id="experiment_001",
        branch_id="branch_001",
        title="Improve Sleep Duration",
        hypothesis="Increasing sleep duration may improve energy levels.",
        metric="sleep_duration",
        target_value=8.0,
        target_unit="hours",
        baseline_value=5.5,
        status=ExperimentStatus.DRAFT,
    )

    return GraphResponse(
        observations=observations,
        branches=[branch],
        evidence=[evidence],
        experiments=[experiment],
    )
