
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


# -------------------------
# ENUMS
# -------------------------

class ObservationStatus(str, Enum):
    VALID = "valid"
    EXCLUDED = "excluded"


class BranchStatus(str, Enum):
    OPEN = "open"
    PAUSED = "paused"
    CONCLUDED = "concluded"


class ExperimentStatus(str, Enum):
    DRAFT = "draft"
    LOCKED = "locked"
    COMPLETED = "completed"
    INSUFFICIENT_DATA = "insufficient_data"


# -------------------------
# OBSERVATION
# -------------------------

class Observation(BaseModel):
    id: str
    metric: str
    value: float
    unit: str
    recorded_at: datetime

    source_record_id: Optional[str] = None

    status: ObservationStatus = ObservationStatus.VALID
    exclusion_reason: Optional[str] = None


# -------------------------
# BRANCH
# -------------------------

class Branch(BaseModel):
    id: str
    title: str
    description: Optional[str] = None

    status: BranchStatus = BranchStatus.OPEN

    created_at: datetime
    updated_at: Optional[datetime] = None


# -------------------------
# EVIDENCE
# -------------------------

class Evidence(BaseModel):
    id: str
    hypothesis_id: str
    observation_id: str

    relationship: str
    explanation: Optional[str] = None


# -------------------------
# EXPERIMENT
# -------------------------

class Experiment(BaseModel):
    id: str
    branch_id: str
    title: str
    hypothesis: str

    metric: str
    target_value: float
    target_unit: str

    baseline_value: Optional[float] = None

    status: ExperimentStatus = ExperimentStatus.DRAFT

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


# -------------------------
# GRAPH RESPONSE
# -------------------------

class GraphResponse(BaseModel):
    observations: list[Observation] = Field(default_factory=list)
    branches: list[Branch] = Field(default_factory=list)
    evidence: list[Evidence] = Field(default_factory=list)
    experiments: list[Experiment] = Field(default_factory=list)
	
