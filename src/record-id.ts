import { RecordId } from "surrealdb";

export function toRecordId(table: string, id: unknown): RecordId {
  if (id instanceof RecordId) return id;
  if (typeof id === "string") {
    const colonIdx = id.indexOf(":");
    if (colonIdx !== -1) {
      return new RecordId(id.slice(0, colonIdx), id.slice(colonIdx + 1));
    }
    return new RecordId(table, id);
  }
  if (typeof id === "number") return new RecordId(table, id);
  return new RecordId(table, String(id));
}

export function recordIdsToStrings<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof RecordId) return value.toString() as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(recordIdsToStrings) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = recordIdsToStrings(v);
    }
    return out as T;
  }
  return value;
}

export function mapNullToUndefined(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const k of Object.keys(out)) {
    if (out[k] === null) out[k] = undefined;
  }
  return out;
}
