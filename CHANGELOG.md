# surrealdb-auth-adapter

## 0.3.0

### Minor Changes

- [#3](https://github.com/cellograph/surrealdb-auth-adapter/pull/3) [`01cad82`](https://github.com/cellograph/surrealdb-auth-adapter/commit/01cad822414b0fe668247aea322fe47386d9f3bb) Thanks [@cellograph](https://github.com/cellograph)! - Support Better Auth 1.7: atomic `consumeOne` / `incrementOne`, real transactions

  Better Auth 1.7 requires two adapter methods this package did not implement, and
  throws rather than falling back when they are missing:

  - **`consumeOne`** — `Adapter "surrealdb-auth-adapter" must implement consumeOne
for atomic single-use credential consumption.` Reached by device-code
    redemption and by database-backed verification-token consumption.
  - **`incrementOne`** — `Adapter "surrealdb-auth-adapter" must implement
incrementOne for atomic guarded counter updates.` Reached by two-factor backup
    codes, the rate limiter, device-authorization polling and organization
    counters.

  Both are now implemented as one SurrealQL statement each (`DELETE … RETURN
BEFORE` and `UPDATE ONLY … SET n += $d … RETURN AFTER`), so the race-safety is
  the database's. The `WHERE` clause acts as both selector and guard: a guard that
  matches nothing returns `null` and writes nothing.

  Also in this release:

  - **Transactions.** `transaction()` now runs against a real SurrealDB
    transaction instead of Better Auth's non-atomic sequential fallback. The
    active transaction is tracked in an `AsyncLocalStorage`, so concurrent
    requests stay isolated; a nested `transaction()` joins the outer one.
  - **Fix: `update()` no longer errors when several rows match.** The scan path
    used `UPDATE ONLY <table> WHERE …`, which fails with "Expected a single result
    output when using the ONLY keyword" as soon as two rows match, where the
    contract asks for one row updated. It now targets a `LIMIT 1` subquery.
  - **`peerDependencies.better-auth` is now `^1.7.0`.** Stay on 0.2.x for Better
    Auth 1.6.

## 0.2.1

### Patch Changes

- [`7b1fb81`](https://github.com/cellograph/surrealdb-auth-adapter/commit/7b1fb81189344cf927996cd872e504864ae285e6) - Fix SurrealDB `DateTime` objects not being converted to JS `Date` in `recordIdsToStrings`. Previously, `instanceof Date` returned false for SurrealDB's own `DateTime` class, leaving date fields unconverted. Callers like Better Auth's JWT plugin would then crash calling `.getTime()` on the raw `DateTime` object (e.g., when sorting JWKS records by `createdAt`). The fix converts `DateTime` to a native `Date` via `.toDate()`.

## 0.2.0

### Minor Changes

- [`1820195`](https://github.com/cellograph/surrealdb-auth-adapter/commit/18201959f91be016d131b7bff6ad70a1134c52a1) - Initial release of surrealdb-auth-adapter
