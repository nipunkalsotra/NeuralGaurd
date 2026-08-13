FROM python:3.14-slim

WORKDIR /app

# System deps for potential sentence-transformers / audit hashing
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# --extra-index-url is required for torch==2.13.0+cpu — that exact local
# version tag is only published on PyTorch's own CPU wheel index, not on
# default PyPI. Base image bumped from 3.11 to 3.14: requirements.txt was
# frozen from a Python 3.14 dev venv and pins numpy==2.5.1 (requires
# Python >=3.12) plus other equally recent packages — 3.11 can't satisfy
# them, which is exactly what broke this build.
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

COPY . .

EXPOSE 8000

# Day 13 perf tuning: --reload is a dev-only flag (runs a continuous
# file-system watcher) that has no business in the image used for the
# live demo — removed. Deliberately staying at 1 worker (no --workers
# flag): SentinelAgent, TriageAgent's circuit breakers, EmbeddingCache/
# DiagnosisCache, circuit_registry, and TokenCounter are all in-memory
# singletons at module scope — multiple worker PROCESSES would each get
# their own independent copy of every one of them, silently breaking the
# shared-state model (a dashboard client could see a different circuit
# breaker state than the one that actually served its request). Multiple
# workers here would be a correctness bug, not a performance win.
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]