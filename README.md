# WORLDBUILD: Celestial Fantasy Worldbuilding & Continuity Engine

WORLDBUILD is a full-stack fictional-universe continuity management application combining cinematic dark academia aesthetics with a PostgreSQL causal validation engine.

---

## Architecture & Technology Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: TailwindCSS v4 with custom Celestial Dark Academia design system, Cinzel / Cormorant Garamond typography, and reduced-motion compliance.
- **Database**: PostgreSQL
  - Embedded local development & testing via `@electric-sql/pglite` (persisting to `.data/postgres` with full SQL constraints and transactions).
  - Production remote PostgreSQL via `pg.Pool` (triggered whenever `DATABASE_URL` is configured).
- **Validation Engine**: Pure database-backed Continuity Oracle executing five deterministic causality rules.

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string (`postgres://...`). If left blank, WORLDBUILD uses the embedded local PostgreSQL engine. | _(empty - uses embedded PGlite)_ |
| `DATABASE_SSL` | Enable SSL for remote PostgreSQL hosts | `false` |
| `PG_IN_MEMORY` | Run ephemeral in-memory PostgreSQL (ideal for isolated testing) | `false` |

---

## Database Migrations & Structure

SQL DDL migrations reside in [001_initial_schema.sql](src/lib/db/migrations/001_initial_schema.sql).

Tables:
- `app_users`: User identities and archivist sessions
- `universes`: Fictional continuums and world metadata
- `characters`: Inhabitants, life spans, death confirmations & exceptions
- `locations`: Realms, astral planes, coordinates
- `chapters`: Narrative sequencing
- `events`: Chronology milestones, locations, death flags
- `event_participants`: Character participation in events
- `event_dependencies`: Causal and prerequisite event DAG edges
- `relationships`: Directed character ties with intensity scoring
- `secrets`: Lore revelations and classifications
- `character_secrets`: Epistemic state (when characters learn secrets)
- `secret_events`: Events where secrets are revealed or deployed
- `continuity_findings`: Deterministic paradox detections with fingerprints

---

## Available Scripts

- `npm run dev`: Launch local development server on port 3000
- `npm test`: Run automated tests (`tsx --test tests/**/*.test.ts`)
- `npm run lint`: Run ESLint verification
- `npm run build`: Build production Next.js application
