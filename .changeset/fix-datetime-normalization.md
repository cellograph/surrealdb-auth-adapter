---
"surrealdb-auth-adapter": patch
---

Fix SurrealDB `DateTime` objects not being converted to JS `Date` in `recordIdsToStrings`. Previously, `instanceof Date` returned false for SurrealDB's own `DateTime` class, leaving date fields unconverted. Callers like Better Auth's JWT plugin would then crash calling `.getTime()` on the raw `DateTime` object (e.g., when sorting JWKS records by `createdAt`). The fix converts `DateTime` to a native `Date` via `.toDate()`.
