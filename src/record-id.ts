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

type Stringify<T> = T extends RecordId
  ? string
  : T extends Date
    ? T
    : T extends (infer U)[]
      ? Stringify<U>[]
      : T extends object
        ? { [K in keyof T]: Stringify<T[K]> }
        : T;

export function recordIdsToStrings<T>(value: T): Stringify<T> {
  if (value === null || value === undefined) return value as Stringify<T>;
  if (value instanceof RecordId) return value.toString() as Stringify<T>;
  if (value instanceof Date) return value as Stringify<T>;
  if (Array.isArray(value)) return value.map(recordIdsToStrings) as Stringify<T>;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = recordIdsToStrings(v);
    }
    return out as Stringify<T>;
  }
  return value as Stringify<T>;
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
