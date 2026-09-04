# surrealdb-auth-adapter

**SurrealDB adapter for [Better Auth](https://better-auth.com)** — a production-grade database adapter connecting SurrealDB's multi-model querying to Better Auth's authentication system.

Targets **SurrealDB v3** with the **`surrealdb@^2.0.3`** JS SDK and **`better-auth@^1.7.0`**.

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

## Atomic operations

Better Auth 1.7 asks adapters for two race-safe primitives, and both are
implemented as a single SurrealQL statement so the atomicity is the database's,
not the adapter's:

| Method | SurrealQL | Used by |
|--------|-----------|---------|
| `consumeOne` | `DELETE … RETURN BEFORE` | verification-token consumption, device-code redemption |
| `incrementOne` | `UPDATE ONLY … SET n += $d … RETURN AFTER` | two-factor backup codes, rate limiting, organization counters |

Both take the `WHERE` clause as *both* selector and guard: when the guard matches
nothing they return `null` and write nothing, rather than throwing. Where the
clause names a record directly the statement targets that record id; otherwise it
targets a `(SELECT VALUE id … LIMIT 1)` subquery, which guarantees at most one row
is touched — SurrealDB's `DELETE`/`UPDATE` accept no `LIMIT`, and
`UPDATE ONLY <table> WHERE …` errors as soon as two rows match.

## Transactions

`transaction()` runs the callback inside a real SurrealDB transaction
(`beginTransaction()` / `commit()` / `cancel()`); every write commits together, or
none of them do:

```ts
await auth.$context.then((ctx) =>
  ctx.adapter.transaction(async (trx) => {
    const user = await trx.create({ model: "user", data: { /* … */ } });
    await trx.create({ model: "session", data: { userId: user.id /* … */ } });
    // throwing anywhere in here rolls both writes back
  }),
);
```

SurrealDB scopes each transaction to its own id on the shared session, so
concurrent requests hold independent transactions. The adapter tracks the current
one in an `AsyncLocalStorage`, which is what keeps overlapping requests from
writing through each other's transaction. A `transaction()` nested inside another
joins the outer one instead of opening a sibling.

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
- `better-auth` ^1.7.0
- `surrealdb` ^2.0.3
- SurrealDB server v3.x

## License

MIT — [cellograph](https://github.com/cellograph)
