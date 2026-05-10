# DocFlow — Async Document Processing Workflow System

A production-style full-stack application for uploading documents, processing them asynchronously via Celery workers, tracking progress in real time, reviewing extracted data, and exporting finalized results.

---

## Architecture Overview

```
┌─────────────┐    HTTP/SSE    ┌─────────────────┐    SQL     ┌──────────────┐
│   React UI  │ ◄────────────► │  FastAPI Backend │ ◄────────► │  PostgreSQL  │
│ (TypeScript)│                │    (Python)      │            │              │
└─────────────┘                └────────┬────────┘            └──────────────┘
                                        │ Celery Task
                                        ▼
                               ┌─────────────────┐    Pub/Sub  ┌──────────────┐
                               │  Celery Worker  │ ◄──────────► │    Redis     │
                               │  (processing)   │             │ (broker+SSE) │
                               └─────────────────┘             └──────────────┘
```

### Key Design Decisions

- **FastAPI async**: All API handlers are `async`; DB access uses `asyncpg` via async SQLAlchemy.
- **Celery + Redis broker**: Documents are enqueued after upload; workers pick them up from the Redis queue.
- **Redis Pub/Sub for progress**: Workers publish structured events on `job_progress:<job_id>` channels. The FastAPI SSE endpoint subscribes and streams these to browsers without polling workers.
- **Server-Sent Events (SSE)**: Chosen over WebSockets for simplicity — one-directional, no overhead of a full WS handshake, works through proxies.
- **Sync DB in worker**: Celery runs in a sync context so the worker uses a standard `sqlalchemy` session (separate from the async FastAPI session pool).

### Component Map

| Component | Location | Purpose |
|---|---|---|
| FastAPI App | `backend/app/main.py` | Entry point, CORS, lifespan |
| API Routes | `backend/app/api/routes.py` | All HTTP endpoints |
| Service Layer | `backend/app/services/document_service.py` | Business logic, DB queries |
| Celery App | `backend/app/workers/celery_app.py` | Broker/backend config |
| Processing Tasks | `backend/app/workers/tasks.py` | Multi-stage processing + pub/sub |
| Models | `backend/app/models/document.py` | SQLAlchemy ORM models |
| Schemas | `backend/app/schemas/document.py` | Pydantic DTOs |
| Redis Client | `backend/app/core/redis_client.py` | Sync + async Redis helpers |
| React App | `frontend/src/` | TypeScript SPA |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Python 3.11 + FastAPI |
| Database | PostgreSQL 15 |
| Background jobs | Celery 5 |
| Message broker | Redis 7 |
| Progress events | Redis Pub/Sub → Server-Sent Events |
| Containerization | Docker Compose |

---

## Setup Instructions

### Prerequisites
- Docker + Docker Compose
- (Optional) Node.js 20+ and Python 3.11+ for local dev

### Quick Start (Docker)

```bash
git clone <repo-url>
cd docflow
docker compose up --build
```

Services:
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Flower** (Celery monitor): http://localhost:5555

### Local Development

**Backend:**
```bash
cd backend
pip install -r requirements.txt

# Start infrastructure only
docker compose up postgres redis -d

# Run API
DATABASE_URL=postgresql+asyncpg://docflow:docflow_secret@localhost:5432/docflow \
SYNC_DATABASE_URL=postgresql://docflow:docflow_secret@localhost:5432/docflow \
REDIS_URL=redis://localhost:6379/0 \
uvicorn app.main:app --reload

# Run worker (separate terminal)
DATABASE_URL=... \
SYNC_DATABASE_URL=... \
REDIS_URL=... \
celery -A app.workers.celery_app worker --loglevel=info
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/upload` | Upload one or more files |
| GET | `/api/jobs` | List jobs (search, filter, sort, paginate) |
| GET | `/api/jobs/{id}` | Get job detail |
| GET | `/api/jobs/{id}/progress` | SSE stream for live progress |
| GET | `/api/jobs/{id}/status` | Polling-friendly status |
| PUT | `/api/jobs/{id}/review` | Update reviewed/edited data |
| POST | `/api/jobs/{id}/finalize` | Mark job as finalized |
| POST | `/api/jobs/{id}/retry` | Retry a failed job |
| GET | `/api/jobs/{id}/export/json` | Export finalized result as JSON |
| GET | `/api/jobs/{id}/export/csv` | Export finalized result as CSV |

---

## Processing Flow

Each document goes through the following stages published via Redis Pub/Sub:

```
job_queued
    → job_started           (5%)
    → parsing_started       (15%)
    → parsing_completed     (40%)
    → extraction_started    (50%)
    → extraction_completed  (75%)
    → storing_result        (90%)
    → job_completed         (100%)
    
    [on error] → job_failed (0%)
```

### Extracted Fields

For each document the worker extracts:
- `title` — derived from filename
- `category` — based on file extension
- `summary` — text preview or description
- `keywords` — tokens from filename
- `language`, `word_count`, `page_count` (simulated)
- `extraction_confidence` — simulated score
- Raw metadata: `file_size_bytes`, `mime_type`, `extension`

---

## Job States

| State | Description |
|---|---|
| `queued` | Task dispatched to Celery, not yet picked up |
| `processing` | Worker is actively processing |
| `completed` | Processing done, awaiting review |
| `failed` | Processing failed (retry available) |
| `finalized` | Reviewed and locked; export available |

---

## Assumptions & Tradeoffs

- **Processing is simulated**: The extraction logic uses filename/extension heuristics and mocked values. In production, this would integrate with OCR, NLP, or AI APIs.
- **SSE over WebSockets**: SSE is sufficient for one-directional progress updates and is simpler to implement without a WS server.
- **Sync DB in Celery**: Celery doesn't support async natively, so the worker uses a separate sync SQLAlchemy engine. This means two connection pools but clear separation.
- **No authentication**: Left out per the assignment scope. Adding JWT/OAuth would involve `python-jose` middleware already in `requirements.txt`.
- **Upload stored on disk**: Files are saved to a local volume. In production, this would be S3/GCS via a storage abstraction.
- **SSE timeout**: SSE connections close after `job_completed` or `job_failed`. For polling fallback use the `/status` endpoint.

## Limitations

- Large files (>50MB) are rejected at the API layer.
- No cancellation of in-progress jobs (Celery task revocation would be the mechanism).
- No horizontal worker scaling config beyond `--concurrency`.
- No file deduplication (idempotency key could be a hash of file content).

## Bonus Features Implemented

- [x] Docker Compose full setup
- [x] Flower for Celery monitoring
- [x] Idempotent retry (job state reset before re-dispatch)
- [x] Live event log in UI
- [x] SSE + polling fallback endpoints
- [x] Multi-file upload

## AI Tool Usage

This project was scaffolded with AI assistance (Claude) for boilerplate generation. All architecture decisions, technology choices, and system design were authored by the developer.
