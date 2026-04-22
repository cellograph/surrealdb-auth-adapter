# surrealdb-auth-adapter

**SurrealDB adapter for [Better Auth](https://better-auth.com)** — a production-grade database adapter connecting SurrealDB's multi-model querying to Better Auth's authentication system.

Targets **SurrealDB v3** with the **`surrealdb@^2.0.3`** JS SDK and **`better-auth@^1.6.7`**.

---

## Installation

```bash
bun add surrealdb-auth-adapter surrealdb better-auth
# or
npm install surrealdb-auth-adapter surrealdb better-auth
```

## Quick Start

```ts
// lib/db.ts
import { Surreal } from "surrealdb";
export const db = new Surreal();
await db.connect("ws://localhost:8000");
await db.use({ namespace: "myapp", database: "production" });
```

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { surrealdbAdapter } from "surrealdb-auth-adapter";
import { db } from "./db";

export const auth = betterAuth({
  database: surrealdbAdapter(db, {
    idGenerator: "surreal.ULID",
  }),
});
```

## Configuration

```ts
surrealdbAdapter(db, {
  // ID generation strategy (default: Better Auth generates ID)
  idGenerator: "surreal.ULID",
  // Other options: "surreal.UUID", "surreal.UUIDv4", "surreal.UUIDv7",
  //                "surreal.guid", "sdk.UUIDv4", "sdk.UUIDv7", "surreal"

  // Use plural table names: "users" instead of "user"
  usePlural: false,

  // Allow data objects to include a custom id field
  allowPassingId: false,

  // Throw on unknown WHERE operators instead of silent fallback
  strictOperators: false,

  // Debug logging
  debugLogs: true,
  // Or fine-grained: { create: true, findOne: true, update: false, ... }
})
```

## ID Generation Strategies

| Strategy         | Where generated          | SurrealQL                              |
|------------------|--------------------------|----------------------------------------|
| `surreal.ULID`   | SurrealDB server         | `type::record('table', rand::ulid())`  |
| `surreal.UUID`   | SurrealDB server         | `type::record('table', rand::uuid())`  |
| `surreal.UUIDv4` | SurrealDB server         | `type::record('table', rand::uuid::v4())` |
| `surreal.UUIDv7` | SurrealDB server         | `type::record('table', rand::uuid::v7())` |
| `surreal.guid`   | SurrealDB server         | `type::record('table', rand::guid())`  |
| `sdk.UUIDv4`     | JS SDK (`Uuid.v4()`)     | `CREATE table:⟨uuid⟩ CONTENT ...`     |
| `sdk.UUIDv7`     | JS SDK (`Uuid.v7()`)     | `CREATE table:⟨uuid⟩ CONTENT ...`     |
| `surreal`        | SurrealDB auto           | `type::record('table')`                |
| _(default)_      | Better Auth              | whatever `advanced.database.generateId` returns |

## Schema Generation

Works with the Better Auth CLI:

```bash
bunx @better-auth/cli generate --output schema.surql
```

This generates a `.surql` file you can paste into [Surrealist](https://surrealist.app) or apply via the SurrealDB CLI.

## Passing a SurrealSession

The adapter accepts both `Surreal` and `SurrealSession` instances:

```ts
const session = await db.forkSession();

const auth = betterAuth({
  database: surrealdbAdapter(session),
});
```

## Requirements

- Node.js ≥ 20 or Bun ≥ 1.2
- `better-auth` ^1.6.7
- `surrealdb` ^2.0.3
- SurrealDB server v3.x

## License

MIT — [cellograph](https://github.com/cellograph)
