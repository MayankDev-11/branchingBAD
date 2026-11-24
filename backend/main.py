from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.generators.demo_data import generate_demo_data
from backend.routes import graph

FRONTEND_ORIGINS = ["http://localhost:5173"]

app = FastAPI(
    title="RootTrace API",
    description="Backend for RootTrace health intelligence platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(graph.router)


@app.get("/")
def root():
    return {
        "message": "Welcome to RootTrace API",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "project": "RootTrace",
        "version": "0.1.0",
    }


@app.get("/api/observations")
def get_observations():
    graph_data = generate_demo_data()

    return {
        "count": len(graph_data.observations),
        "observations": graph_data.observations,
    }


@app.get("/api/observations/{observation_id}")
def get_observation(observation_id: str):
    graph_data = generate_demo_data()

    for observation in graph_data.observations:
        if observation.id == observation_id:
            return observation

    raise HTTPException(
        status_code=404,
        detail=f"Observation '{observation_id}' not found",
    )



@app.get("/api/branches")
def get_branches():
    graph_data = generate_demo_data()

    return {
        "count": len(graph_data.branches),
        "branches": graph_data.branches,
    }


@app.get("/api/branches/{branch_id}")
def get_branch(branch_id: str):
    graph_data = generate_demo_data()

    for branch in graph_data.branches:
        if branch.id == branch_id:
            return branch

    raise HTTPException(
        status_code=404,
        detail=f"Branch '{branch_id}' not found",
    )



@app.get("/api/experiments")
def get_experiments():
    graph_data = generate_demo_data()

    return {
        "count": len(graph_data.experiments),
        "experiments": graph_data.experiments,
    }


@app.get("/api/experiments/{experiment_id}")
def get_experiment(experiment_id: str):
    graph_data = generate_demo_data()

    for experiment in graph_data.experiments:
        if experiment.id == experiment_id:
            return experiment

    raise HTTPException(
        status_code=404,
        detail=f"Experiment '{experiment_id}' not found",
    )



@app.get("/api/evidence")
def get_evidence():
    graph_data = generate_demo_data()

    return {
        "count": len(graph_data.evidence),
        "evidence": graph_data.evidence,
    }


@app.get("/api/evidence/{evidence_id}/provenance")
def get_evidence_provenance(evidence_id: str):
    graph_data = generate_demo_data()

    evidence = next(
        (
            item for item in graph_data.evidence
            if item.id == evidence_id
        ),
        None,
    )

    if evidence is None:
        raise HTTPException(
            status_code=404,
            detail=f"Evidence '{evidence_id}' not found",
        )

    observation = next(
        (
            item for item in graph_data.observations
            if item.id == evidence.observation_id
        ),
        None,
    )

    if observation is None:
        raise HTTPException(
            status_code=404,
            detail="Linked observation not found",
        )

    return {
        "evidence": evidence,
        "source_observation": observation,
    }

