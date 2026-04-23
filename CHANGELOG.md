# surrealdb-auth-adapter

## 0.2.1

### Patch Changes

- [`7b1fb81`](https://github.com/cellograph/surrealdb-auth-adapter/commit/7b1fb81189344cf927996cd872e504864ae285e6) - Fix SurrealDB `DateTime` objects not being converted to JS `Date` in `recordIdsToStrings`. Previously, `instanceof Date` returned false for SurrealDB's own `DateTime` class, leaving date fields unconverted. Callers like Better Auth's JWT plugin would then crash calling `.getTime()` on the raw `DateTime` object (e.g., when sorting JWKS records by `createdAt`). The fix converts `DateTime` to a native `Date` via `.toDate()`.

## 0.2.0

### Minor Changes

- [`1820195`](https://github.com/cellograph/surrealdb-auth-adapter/commit/18201959f91be016d131b7bff6ad70a1134c52a1) - Initial release of surrealdb-auth-adapter
