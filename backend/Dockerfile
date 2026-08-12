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

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]