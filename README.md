# Newtonite Ops — High-Velocity Operations Command Center

Newtonite Ops is a full-stack, enterprise-grade operations command center designed for multi-team execution, rigorous role-based access control (RBAC), atomic concurrency, idempotency, transactional outbox guarantee, and high-performance keyset cursor pagination.

---

## Architecture Overview

Newtonite Ops follows a robust decoupled client-server architecture:

```
┌───────────────┐       Vite Proxy (/api)       ┌────────────────────────┐
│  React 19 SPA │ ────────────────────────────> │ Express.js REST API    │
│  (Tailwind 4) │                               │ (TypeScript / Node 20) │
└───────────────┘                               └───────────┬────────────┘
                                                            │ Prisma ORM
                                                ┌───────────▼────────────┐
                                                │ PostgreSQL 16 Database │
                                                └────────────────────────┘
```

- **Frontend (`/frontend`)**: Single-page application built with React 19, TypeScript, Vite, Tailwind CSS v4, and Lucide icons. Communicates with the backend via Vite's `/api` proxy configured to `http://localhost:4000`.
- **Backend (`/backend`)**: REST API built with Node.js, Express, TypeScript, and Prisma ORM. Implements strict team-scoped RBAC, atomic claiming, integer-version optimistic locking (returning `409 Conflict` with latest state), request idempotency keys, and a transactional outbox background worker.
- **Database (`/backend/prisma`)**: PostgreSQL schema with relational indices optimized for high-throughput filtering, keyset cursor pagination (`WHERE (createdAt, id) < (...)`), and transactional consistency.

---

## Mermaid System Architecture Diagram

```mermaid
graph TD
    subgraph Client["Frontend SPA (React 19 + Tailwind CSS)"]
        UI[Dashboard / Kanban / Table / Item Drawer]
        APIClient["Axios / Fetch Client (/api)"]
    end

    subgraph Server["Backend API (Express + TypeScript)"]
        Auth[JWT Authentication & Session Middleware]
        RBAC[Team-Scoped RBAC & Workflow Guards]
        Idempotency[Idempotency Key Middleware]
        ItemsRouter[Work Items & Transactions Router]
        OutboxWorker[Background Outbox Poller]
    end

    subgraph DB["PostgreSQL 16"]
        Prisma[("Prisma ORM")]
    end

    UI -->|HTTP Requests| APIClient
    APIClient -->|"/api/* (Vite Proxy)"| Auth
    Auth --> RBAC
    RBAC --> Idempotency
    Idempotency --> ItemsRouter
    ItemsRouter -->|ACID Transactions| Prisma
    OutboxWorker -->|Poll Pending Outbox Jobs| Prisma
```

---

## Local Setup & Installation

### Prerequisites
- Node.js (v20+ recommended)
- Docker & Docker Compose (for PostgreSQL)

### 1. Environment Configuration
Copy the environment template in the project root:
```bash
cp .env.example .env
```
*(Ensure `DATABASE_URL` matches your local PostgreSQL connection string, e.g., `postgresql://newtonite:newtonite_dev_password@localhost:5433/newtonite_ops?schema=public`)*

### 2. Start PostgreSQL via Docker Compose
```bash
docker compose up -d
```

### 3. Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 4. Run Database Migrations & Seed Data
From the `backend` directory:
```bash
# Run prisma migrations
npm run db:migrate:deploy

# Seed database with 4 teams, 10 users, and 2,500 work items
npm run db:seed
```

### 5. Start Development Servers
You can run backend and frontend concurrently:

**Backend (`http://localhost:4000`)**:
```bash
cd backend
npm run dev
```

**Frontend (`http://localhost:5173`)**:
```bash
cd frontend
npm run dev
```

---

## Seeded Demo Credentials Table (4 Teams, 10 Users)

All user accounts use password: `password123`

| Email | Name | Teams & Roles |
| :--- | :--- | :--- |
| `admin@newtonite.io` | Alex Admin | **Payments Operations** (ADMIN), **Core Infrastructure** (ADMIN), **Customer Trust** (ADMIN), **Compliance & Legal** (ADMIN) |
| `lead.payments@newtonite.io` | Priya Payments | **Payments Operations** (LEAD) |
| `lead.infra@newtonite.io` | Jordan Infra | **Core Infrastructure** (LEAD) |
| `lead.trust@newtonite.io` | Sam Trust | **Customer Trust** (LEAD) |
| `lead.compliance@newtonite.io` | Casey Compliance | **Compliance & Legal** (LEAD) |
| `member.ops@newtonite.io` | Morgan Ops | **Payments Operations** (MEMBER), **Core Infrastructure** (MEMBER) |
| `member.support@newtonite.io` | Riley Support | **Customer Trust** (MEMBER) |
| `member.legal@newtonite.io` | Taylor Legal | **Compliance & Legal** (MEMBER) |
| `viewer.analyst@newtonite.io` | Jamie Analyst | **Payments Operations** (VIEWER), **Customer Trust** (VIEWER) |
| `viewer.audit@newtonite.io` | Quinn Audit | **Compliance & Legal** (VIEWER), **Core Infrastructure** (VIEWER) |

---

## 2-Minute Reviewer Guide

Follow this quick guide to verify core system capabilities:

### 1. Test Team-Scoped RBAC
1. Log in as `viewer.analyst@newtonite.io` (`password123`). Notice they can view items in **Payments Operations** and **Customer Trust**, but cannot create, claim, edit, or transition items (Mutations return `403 Forbidden`).
2. Switch accounts to `member.ops@newtonite.io`. They can create and edit items in Payments Ops, but cannot approve/close items or manage team members.
3. Switch to `admin@newtonite.io` to exercise global admin privileges across all 4 teams.

### 2. Test Atomic Claiming
1. Open any unassigned work item in the UI while logged in as a MEMBER or LEAD.
2. Click **Claim Item**. The backend executes an atomic conditional update (`UPDATE WorkItem SET assigneeId = user.id WHERE id = ? AND assigneeId IS NULL`), ensuring no double-assignment race conditions occur under concurrent clicks.

### 3. Test Request Idempotency
1. When submitting a new work item creation request, the frontend sends an `Idempotency-Key` HTTP header (UUID).
2. If network retries or double-submissions occur with the same key, the backend idempotency middleware immediately replays the cached response without duplicating records.

### 4. Test Transactional Outbox Worker
1. Mutations (Creation, Updates, Transitions, Comments) atomically enqueue jobs into the `OutboxJob` table within the same database transaction.
2. A background polling worker (`outboxWorker.ts`) processes pending jobs with exponential backoff retries, ensuring reliable event dispatching without distributed two-phase commit overhead.

### 5. Test 409 Optimistic Locking Conflict
1. Open the same work item in two browser tabs (or test clients).
2. Edit and save changes in Tab A. The item version increments from `1` to `2`.
3. Attempt to save changes from Tab B (still holding version `1`). The backend detects the version mismatch and rejects the request with a **`409 Conflict`**, returning the latest `currentItem` payload so the UI can prompt the user to refresh.
