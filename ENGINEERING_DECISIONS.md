# Engineering Decisions & Architecture Trade-Offs

This document details the core architectural decisions, design patterns, and engineering trade-offs implemented in Newtonite Ops.

---

## 1. Team-Scoped RBAC at the API Layer

### Context & Requirements
Newtonite Ops manages work items across multiple independent teams (Payments Operations, Core Infrastructure, Customer Trust, Compliance & Legal). Users hold distinct roles per team (`VIEWER`, `MEMBER`, `LEAD`, `ADMIN`) or global admin privileges.

### Architectural Decision
Role-Based Access Control (RBAC) is enforced centrally at the API middleware and service layers (`workflowAndPermissions.ts`). Every request targeting a team's resource validates:
1. **Team Membership / Global Admin status**: Users can only read/write items belonging to teams they belong to (or all teams if `ADMIN`).
2. **Granular Permissions**: Actions such as `work_item:create`, `work_item:claim`, `work_item:assign`, `work_item:change_status`, `work_item:approve`, and `team:manage_members` are checked against the user's role on the target team.
3. **Workflow State Machine**: Status transitions (`OPEN` -> `IN_PROGRESS` -> `AWAITING_APPROVAL` -> `RESOLVED` -> `CLOSED`) are validated against strict state graphs, with specific sensitive transitions (e.g., `RESOLVED` -> `CLOSED`) restricted to `LEAD` and `ADMIN` roles.

### Trade-Offs & Alternatives Considered
- **Alternative 1: Global ACLs / Flat Roles**: Simpler to implement but violates multi-tenant/multi-team data isolation where an engineer should have `LEAD` privileges in Infrastructure but `VIEWER` privileges in Compliance.
- **Alternative 2: Database Row-Level Security (RLS)**: PostgreSQL RLS policies can enforce tenant/team boundaries at the SQL level. However, RLS adds complexity to Prisma ORM migration management, query inspection, and error messaging. Implementing team scoping at the application service layer provides transparent HTTP `403 Forbidden` responses, easy unit testing, and robust audit logging.

---

## 2. Integer Version Optimistic Locking Returning 409 Conflict

### Context & Requirements
In high-velocity operations centers, multiple team members frequently inspect and update the same work items concurrently. Last-write-wins updates lead to silent data loss.

### Architectural Decision
Every `WorkItem` record includes an integer `version` field (default `1`). 
- When updating or transitioning an item, the client must submit the current `version`.
- The database update query increments the version conditionally:
  ```sql
  UPDATE "WorkItem" SET title = $1, version = version + 1 WHERE id = $2 AND version = $3;
  ```
- If `updated.count === 0`, it indicates a concurrent modification. The backend queries the current state and responds with **`409 Conflict`** along with the latest `currentItem` payload.
- The frontend catches the 409 response, displays a conflict banner in the Item Drawer, and provides a **"Refresh to Latest"** action.

### Trade-Offs & Alternatives Considered
- **Alternative 1: Pessimistic Locking (`SELECT ... FOR UPDATE`)**: Locks rows during inspection. This prevents concurrent read/write throughput and can introduce lock contention and database connection timeouts during high-traffic incidents.
- **Alternative 2: Last-Write-Wins**: Easy to build but unacceptable in operations workflows where an operator's status change or priority update must never silently overwrite another operator's concurrent edit.

---

## 3. Idempotency-Key Request Hashing

### Context & Requirements
Network instability, accidental double-clicks, or client retries can cause duplicate creation of high-impact work items (e.g., creating duplicate incidents or payments investigation tickets).

### Architectural Decision
- Clients attach an `Idempotency-Key` HTTP header (UUID) to `POST /api/items` requests.
- The `idempotencyMiddleware` checks the database `IdempotencyKey` table for an existing record matching the key and user ID.
- If found, the stored `statusCode` and `responseBody` are replayed immediately without re-executing business logic.
- If not found, the operation executes inside an ACID database transaction that atomically creates the work item and records the idempotency key and response.

### Trade-Offs & Alternatives Considered
- **Alternative 1: Client-Side De-bounce Only**: Insufficient against network retries, browser page reloads, or automated API integrations.
- **Alternative 2: Redis-backed Distributed Cache**: Excellent for high-scale distributed systems, but introduces an external caching dependency and operational overhead. Storing idempotency keys in PostgreSQL leverages existing ACID guarantees and ensures transactional atomicity with work item creation.

---

## 4. Transactional Outbox Pattern with Exponential Backoff

### Context & Requirements
Mutations (creating items, status transitions, comments) often need to trigger asynchronous side-effects (webhook delivery, audit logging, notifications). Dual-write failures (database commit succeeds but event dispatch fails) cause data inconsistencies.

### Architectural Decision
- Newtonite Ops implements the **Transactional Outbox Pattern**.
- Whenever a domain event occurs, an `OutboxJob` record is created **in the exact same database transaction** as the work item change.
- A background worker (`outboxWorker.ts`) polls pending outbox jobs (`status: PENDING`, `nextRunAt <= now`), marks them `PROCESSING`, and executes side-effects.
- If processing fails, the job attempt counter is incremented, and `nextRunAt` is scheduled with **exponential backoff** (`1s, 2s, 4s, ...` up to `60s`). If `maxAttempts` (3) is exceeded, the job is marked `FAILED`.

### Trade-Offs & Alternatives Considered
- **Alternative 1: Direct Message Broker Publish (Kafka/RabbitMQ)**: Prone to dual-write failures if the database transaction succeeds while broker publication fails (or vice versa).
- **Alternative 2: Synchronous Notification Calls inside HTTP Request**: Increases HTTP response latency and couples API availability to external webhook receiver reliability. Outbox pattern guarantees at-least-once asynchronous delivery decoupled from HTTP request lifecycles.

---

## 5. Keyset Cursor Pagination

### Context & Requirements
The database is seeded with 2,500+ realistic work items and scales to tens of thousands of ops tickets. Traditional offset-based pagination (`LIMIT / OFFSET`) performs poorly on large datasets because PostgreSQL scans and discards skipped rows.

### Architectural Decision
- Newtonite Ops uses **Keyset Cursor Pagination** based on deterministic compound sorting: `ORDER BY createdAt DESC, id DESC`.
- The pagination cursor is a base64url-encoded string containing the last item's `createdAt` timestamp and unique `id`:
  ```ts
  WHERE (createdAt < :cursorTime) OR (createdAt = :cursorTime AND id < :cursorId)
  ```
- This allows PostgreSQL to utilize composite indexes (`@@index([createdAt(sort: Desc), id(sort: Desc)])`) for O(1) index lookups regardless of pagination depth.

### Trade-Offs & Alternatives Considered
- **Alternative 1: Offset/Limit Pagination (`OFFSET 10000 LIMIT 25`)**: Suffers from O(N) performance degradation on deep pages and inconsistent results if rows are inserted or deleted while navigating pages.
- **Alternative 2: Infinite Scroll without cursors**: Impractical for operations center users who need deterministic navigation and exact result counts. Keyset cursors provide high-performance, stable pagination even with frequent concurrent record insertions.
