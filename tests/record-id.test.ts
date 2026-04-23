import { RecordId } from "surrealdb";
import { describe, expect, test } from "vitest";
import {
  mapNullToUndefined,
  recordIdsToStrings,
  toRecordId,
} from "../src/record-id.js";

describe("toRecordId", () => {
  test("wraps plain string ID in RecordId with given table", () => {
    const result = toRecordId("user", "abc123");
    expect(result).toBeInstanceOf(RecordId);
    expect(result.toString()).toBe("user:abc123");
  });

  test("parses 'table:id' string, uses embedded table name", () => {
    const result = toRecordId("ignored", "session:xyz");
    expect(result.toString()).toBe("session:xyz");
  });

  test("returns existing RecordId instance unchanged", () => {
    const rid = new RecordId("user", "existing");
    expect(toRecordId("user", rid)).toBe(rid);
  });

  test("wraps numeric ID in RecordId", () => {
    const result = toRecordId("item", 42);
    expect(result).toBeInstanceOf(RecordId);
  });

  test("handles ID with multiple colons by splitting at first colon only", () => {
    const result = toRecordId("ignored", "ns:table:id");
    expect(result.toString()).toBe("ns:⟨table:id⟩");
  });
});

describe("recordIdsToStrings", () => {
  test("converts RecordId to its string representation", () => {
    const rid = new RecordId("user", "abc");
    expect(recordIdsToStrings(rid)).toBe("user:abc");
  });

  test("converts RecordId values inside a flat object", () => {
    const input = { id: new RecordId("user", "abc"), name: "Alice" };
    expect(recordIdsToStrings(input)).toEqual({
      id: "user:abc",
      name: "Alice",
    });
  });

  test("converts RecordId values inside nested objects", () => {
    const input = { nested: { id: new RecordId("user", "abc") } };
    expect(recordIdsToStrings(input)).toEqual({ nested: { id: "user:abc" } });
  });

  test("converts RecordId values inside arrays", () => {
    const input = [new RecordId("user", "a"), new RecordId("user", "b")];
    expect(recordIdsToStrings(input)).toEqual(["user:a", "user:b"]);
  });

  test("passes Date values through without modification", () => {
    const date = new Date("2024-01-01");
    expect(recordIdsToStrings(date)).toBe(date);
  });

  test("passes null through unchanged", () => {
    expect(recordIdsToStrings(null)).toBeNull();
  });

  test("passes undefined through unchanged", () => {
    expect(recordIdsToStrings(undefined)).toBeUndefined();
  });

  test("passes primitive string through unchanged", () => {
    expect(recordIdsToStrings("hello")).toBe("hello");
  });

  test("passes number through unchanged", () => {
    expect(recordIdsToStrings(42)).toBe(42);
  });
});

describe("mapNullToUndefined", () => {
  test("converts null values to undefined", () => {
    const result = mapNullToUndefined({ a: null, b: "hello", c: null });
    expect(result.a).toBeUndefined();
    expect(result.b).toBe("hello");
    expect(result.c).toBeUndefined();
  });

  test("does not mutate the original object", () => {
    const input = { a: null };
    mapNullToUndefined(input);
    expect(input.a).toBeNull();
  });

  test("leaves non-null values untouched", () => {
    const date = new Date();
    const result = mapNullToUndefined({ d: date, n: 0, b: false });
    expect(result.d).toBe(date);
    expect(result.n).toBe(0);
    expect(result.b).toBe(false);
  });
});
