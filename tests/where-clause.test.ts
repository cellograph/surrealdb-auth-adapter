import type { CleanedWhere } from "better-auth/adapters";
import { RecordId } from "surrealdb";
import { describe, expect, test } from "vitest";
import { buildWhereClause } from "../src/where-clause.js";
import type { WhereContext } from "../src/where-clause.js";

const ctx: WhereContext = {
  getModelName: (model) => model,
  getFieldName: ({ field }) => field,
  getReferencedModel: (_table, field) => (field === "userId" ? "user" : null),
};

function w(overrides: Partial<CleanedWhere>): CleanedWhere {
  return {
    field: "name",
    value: "Alice",
    operator: "eq",
    connector: "AND",
    mode: "sensitive",
    ...overrides,
  };
}

describe("buildWhereClause", () => {
  test("returns empty string for empty array", () => {
    expect(buildWhereClause({}, [], "user", ctx)).toBe("");
  });

  test("builds eq condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "email", value: "a@b.com" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE email = $where_0");
    expect(bindings.where_0).toBe("a@b.com");
  });

  test("converts id field value to RecordId for eq", () => {
    const bindings: Record<string, unknown> = {};
    buildWhereClause(bindings, [w({ field: "id", value: "abc" })], "user", ctx);
    expect(bindings.where_0).toBeInstanceOf(RecordId);
    expect((bindings.where_0 as RecordId).toString()).toBe("user:abc");
  });

  test("builds ne condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ operator: "ne" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE name != $where_0");
  });

  test("builds gt condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "count", value: 5, operator: "gt" })],
      "item",
      ctx,
    );
    expect(result).toBe(" WHERE count > $where_0");
  });

  test("builds gte condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "count", value: 5, operator: "gte" })],
      "item",
      ctx,
    );
    expect(result).toBe(" WHERE count >= $where_0");
  });

  test("builds lt condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "count", value: 5, operator: "lt" })],
      "item",
      ctx,
    );
    expect(result).toBe(" WHERE count < $where_0");
  });

  test("builds lte condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "count", value: 5, operator: "lte" })],
      "item",
      ctx,
    );
    expect(result).toBe(" WHERE count <= $where_0");
  });

  test("builds IN condition with string array", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "name", value: ["Alice", "Bob"], operator: "in" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE name IN $where_0");
    expect(bindings.where_0).toEqual(["Alice", "Bob"]);
  });

  test("converts id array to RecordIds for IN condition", () => {
    const bindings: Record<string, unknown> = {};
    buildWhereClause(
      bindings,
      [w({ field: "id", value: ["a", "b"], operator: "in" })],
      "user",
      ctx,
    );
    const vals = bindings.where_0 as RecordId[];
    expect(vals[0]).toBeInstanceOf(RecordId);
    expect(vals[0]?.toString()).toBe("user:a");
    expect(vals[1]?.toString()).toBe("user:b");
  });

  test("skips IN condition when array is empty", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "name", value: [], operator: "in" })],
      "user",
      ctx,
    );
    expect(result).toBe("");
  });

  test("builds NOT IN condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "name", value: ["Alice"], operator: "not_in" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE name NOT IN $where_0");
  });

  test("skips NOT IN condition when array is empty", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "name", value: [], operator: "not_in" })],
      "user",
      ctx,
    );
    expect(result).toBe("");
  });

  test("builds contains condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "bio", value: "dev", operator: "contains" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE bio CONTAINS $where_0");
  });

  test("builds starts_with condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "name", value: "Al", operator: "starts_with" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE string::starts_with(name, $where_0)");
  });

  test("builds ends_with condition", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ field: "email", value: ".com", operator: "ends_with" })],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE string::ends_with(email, $where_0)");
  });

  test("builds case-insensitive eq using string::lowercase", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [
        w({
          field: "email",
          value: "A@B.COM",
          operator: "eq",
          mode: "insensitive",
        }),
      ],
      "user",
      ctx,
    );
    expect(result).toBe(
      " WHERE string::lowercase(email) = string::lowercase($where_0)",
    );
  });

  test("builds case-insensitive contains using string::lowercase", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [
        w({
          field: "name",
          value: "ALICE",
          operator: "contains",
          mode: "insensitive",
        }),
      ],
      "user",
      ctx,
    );
    expect(result).toBe(
      " WHERE string::lowercase(name) CONTAINS string::lowercase($where_0)",
    );
  });

  test("builds case-insensitive starts_with", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [
        w({
          field: "name",
          value: "AL",
          operator: "starts_with",
          mode: "insensitive",
        }),
      ],
      "user",
      ctx,
    );
    expect(result).toBe(
      " WHERE string::starts_with(string::lowercase(name), string::lowercase($where_0))",
    );
  });

  test("builds case-insensitive ends_with", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [
        w({
          field: "email",
          value: ".COM",
          operator: "ends_with",
          mode: "insensitive",
        }),
      ],
      "user",
      ctx,
    );
    expect(result).toBe(
      " WHERE string::ends_with(string::lowercase(email), string::lowercase($where_0))",
    );
  });

  test("joins two conditions with AND connector", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [
        w({ field: "name", value: "Alice" }),
        w({ field: "email", value: "a@b.com", connector: "AND" }),
      ],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE name = $where_0 AND email = $where_1");
  });

  test("joins two conditions with OR connector", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [
        w({ field: "name", value: "Alice" }),
        w({ field: "name", value: "Bob", connector: "OR" }),
      ],
      "user",
      ctx,
    );
    expect(result).toBe(" WHERE name = $where_0 OR name = $where_1");
  });

  test("converts reference field string value to RecordId", () => {
    const bindings: Record<string, unknown> = {};
    buildWhereClause(
      bindings,
      [w({ field: "userId", value: "user-abc" })],
      "session",
      ctx,
    );
    expect(bindings.where_0).toBeInstanceOf(RecordId);
    expect((bindings.where_0 as RecordId).toString()).toBe("user:⟨user-abc⟩");
  });

  test("throws on unknown operator when strictOperators: true", () => {
    expect(() =>
      buildWhereClause(
        {},
        [w({ operator: "unknown" as CleanedWhere["operator"] })],
        "user",
        ctx,
        { strictOperators: true },
      ),
    ).toThrow("[surrealdb-auth-adapter]: Unknown operator 'unknown'");
  });

  test("falls back to eq on unknown operator when strictOperators: false", () => {
    const bindings: Record<string, unknown> = {};
    const result = buildWhereClause(
      bindings,
      [w({ operator: "unknown" as CleanedWhere["operator"] })],
      "user",
      ctx,
      { strictOperators: false },
    );
    expect(result).toBe(" WHERE name = $where_0");
  });
});
