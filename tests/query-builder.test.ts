import type { CleanedWhere } from "better-auth/adapters";
import { RecordId } from "surrealdb";
import { describe, expect, test } from "vitest";
import {
  buildCreateQuery,
  buildIncrementSetClause,
  buildQuerySuffix,
  buildRecordIdMap,
  buildSingleRecordTarget,
  extractDirectRecords,
} from "../src/query-builder.js";

function w(overrides: Partial<CleanedWhere>): CleanedWhere {
  return {
    field: "id",
    value: "test",
    operator: "eq",
    connector: "AND",
    mode: "sensitive",
    ...overrides,
  };
}

describe("buildQuerySuffix", () => {
  test("returns empty string with no options", () => {
    expect(buildQuerySuffix()).toBe("");
  });

  test("adds LIMIT 1 for limitOne", () => {
    expect(buildQuerySuffix({ limitOne: true })).toBe(" LIMIT 1");
  });

  test("adds LIMIT N for numeric limit", () => {
    expect(buildQuerySuffix({ limit: 10 })).toBe(" LIMIT 10");
  });

  test("limitOne takes precedence over limit", () => {
    expect(buildQuerySuffix({ limitOne: true, limit: 10 })).toBe(" LIMIT 1");
  });

  test("adds START AT for offset", () => {
    expect(buildQuerySuffix({ offset: 20 })).toBe(" START AT 20");
  });

  test("adds GROUP ALL", () => {
    expect(buildQuerySuffix({ groupAll: true })).toBe(" GROUP ALL");
  });

  test("adds RETURN AFTER", () => {
    expect(buildQuerySuffix({ returnAfter: true })).toBe(" RETURN AFTER");
  });

  test("adds RETURN with field list", () => {
    expect(buildQuerySuffix({ returnFields: "id, name" })).toBe(
      " RETURN id, name",
    );
  });

  test("adds ORDER BY field ASC by default", () => {
    const fn = ({ field }: { model: string; field: string }) => field;
    expect(
      buildQuerySuffix({ sortBy: { field: "name" }, model: "user" }, fn),
    ).toBe(" ORDER BY name ASC");
  });

  test("adds ORDER BY field DESC", () => {
    const fn = ({ field }: { model: string; field: string }) => field;
    expect(
      buildQuerySuffix(
        { sortBy: { field: "createdAt", direction: "desc" }, model: "user" },
        fn,
      ),
    ).toBe(" ORDER BY createdAt DESC");
  });

  test("combines ORDER BY + LIMIT + START AT in correct order", () => {
    const fn = ({ field }: { model: string; field: string }) => field;
    expect(
      buildQuerySuffix(
        { sortBy: { field: "name" }, model: "user", limit: 10, offset: 5 },
        fn,
      ),
    ).toBe(" ORDER BY name ASC LIMIT 10 START AT 5");
  });
});

describe("buildCreateQuery", () => {
  test("uses type::record() when no idGenerator set", () => {
    const q = buildCreateQuery("user", { name: "Alice" });
    expect(q.query).toBe("CREATE type::record('user') CONTENT $content");
  });

  test("uses rand::ulid() for surreal.ULID", () => {
    const q = buildCreateQuery("user", {}, { idGenerator: "surreal.ULID" });
    expect(q.query).toBe(
      "CREATE type::record('user', rand::ulid()) CONTENT $content",
    );
  });

  test("uses rand::uuid() for surreal.UUID", () => {
    const q = buildCreateQuery("user", {}, { idGenerator: "surreal.UUID" });
    expect(q.query).toBe(
      "CREATE type::record('user', rand::uuid()) CONTENT $content",
    );
  });

  test("uses rand::uuid::v4() for surreal.UUIDv4", () => {
    const q = buildCreateQuery("user", {}, { idGenerator: "surreal.UUIDv4" });
    expect(q.query).toBe(
      "CREATE type::record('user', rand::uuid::v4()) CONTENT $content",
    );
  });

  test("uses rand::uuid::v7() for surreal.UUIDv7", () => {
    const q = buildCreateQuery("user", {}, { idGenerator: "surreal.UUIDv7" });
    expect(q.query).toBe(
      "CREATE type::record('user', rand::uuid::v7()) CONTENT $content",
    );
  });

  test("uses rand::guid() for surreal.guid", () => {
    const q = buildCreateQuery("user", {}, { idGenerator: "surreal.guid" });
    expect(q.query).toBe(
      "CREATE type::record('user', rand::guid()) CONTENT $content",
    );
  });

  test("uses customId as the record target when provided", () => {
    const q = buildCreateQuery("user", {}, undefined, "my-id");
    expect(q.query).toMatch(/^CREATE user:/);
  });

  test("uses generateId() when provided and no customId", () => {
    const q = buildCreateQuery(
      "user",
      {},
      undefined,
      undefined,
      undefined,
      () => "gen-id",
    );
    expect(q.query).toMatch(/^CREATE user:/);
    expect(q.query).toContain("gen-id");
  });

  test("customId takes precedence over generateId", () => {
    const q = buildCreateQuery(
      "user",
      {},
      undefined,
      "custom",
      undefined,
      () => "gen-id",
    );
    expect(q.query).toContain("custom");
    expect(q.query).not.toContain("gen-id");
  });

  test("appends RETURN clause when selectFields provided", () => {
    const q = buildCreateQuery(
      "user",
      { name: "Alice" },
      undefined,
      undefined,
      "id, name",
    );
    expect(q.query).toBe(
      "CREATE type::record('user') CONTENT $content RETURN id, name",
    );
  });

  test("binds content to $content parameter", () => {
    const content = { name: "Alice" };
    const q = buildCreateQuery("user", content);
    expect(q.bindings.content).toEqual(content);
  });
});

describe("extractDirectRecords", () => {
  test("returns null for empty where array", () => {
    expect(extractDirectRecords([], "user")).toBeNull();
  });

  test("returns null when no id field in where", () => {
    expect(
      extractDirectRecords([w({ field: "email", value: "a@b.com" })], "user"),
    ).toBeNull();
  });

  test("extracts RecordId from id eq condition", () => {
    const result = extractDirectRecords(
      [w({ field: "id", value: "abc", operator: "eq" })],
      "user",
    );
    expect(result).not.toBeNull();
    expect(result?.recordIds).toHaveLength(1);
    expect(result?.recordIds[0]?.toString()).toBe("user:abc");
    expect(result?.remainingWhere).toHaveLength(0);
  });

  test("leaves non-id conditions in remainingWhere", () => {
    const result = extractDirectRecords(
      [
        w({ field: "id", value: "abc" }),
        w({ field: "email", value: "a@b.com" }),
      ],
      "user",
    );
    expect(result?.remainingWhere).toHaveLength(1);
    expect(result?.remainingWhere[0]?.field).toBe("email");
  });

  test("extracts multiple RecordIds from id IN condition", () => {
    const result = extractDirectRecords(
      [w({ field: "id", value: ["a", "b", "c"], operator: "in" })],
      "user",
    );
    expect(result?.recordIds).toHaveLength(3);
    expect(result?.recordIds[0]?.toString()).toBe("user:a");
    expect(result?.recordIds[2]?.toString()).toBe("user:c");
  });
});

describe("buildRecordIdMap", () => {
  test("returns empty map when tables is empty", () => {
    const map = buildRecordIdMap(
      // biome-ignore lint/suspicious/noExplicitAny: schema mock for testing
      {} as any,
      (m) => m,
      ({ field }) => field,
    );
    expect(map.tableSpecific).toEqual({});
  });

  test("maps reference fields to their target tables", () => {
    const tables = {
      session: {
        fields: {
          userId: { references: { model: "user", field: "id" } },
          token: {},
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: schema mock for testing
    } as any;
    const map = buildRecordIdMap(
      tables,
      (m) => m,
      ({ field }) => field,
    );
    expect(map.tableSpecific.session?.userId).toBe("user");
  });

  test("ignores fields with no references", () => {
    const tables = {
      user: { fields: { email: {}, name: {} } },
      // biome-ignore lint/suspicious/noExplicitAny: schema mock for testing
    } as any;
    const map = buildRecordIdMap(
      tables,
      (m) => m,
      ({ field }) => field,
    );
    expect(map.tableSpecific.user).toEqual({});
  });
});

describe("buildSingleRecordTarget", () => {
  test("wraps the table in a LIMIT 1 id subquery", () => {
    expect(buildSingleRecordTarget("user", " WHERE email = $where_0")).toBe(
      "(SELECT VALUE id FROM user WHERE email = $where_0 LIMIT 1)",
    );
  });

  test("works with an empty where clause", () => {
    expect(buildSingleRecordTarget("user", "")).toBe(
      "(SELECT VALUE id FROM user LIMIT 1)",
    );
  });
});

describe("buildIncrementSetClause", () => {
  const identity = (field: string) => field;

  test("builds += assignments for increments", () => {
    const bindings: Record<string, unknown> = {};
    const clause = buildIncrementSetClause(
      bindings,
      { attempts: 1 },
      undefined,
      identity,
    );
    expect(clause).toBe(" SET attempts += $inc_attempts");
    expect(bindings).toEqual({ inc_attempts: 1 });
  });

  test("supports negative deltas", () => {
    const bindings: Record<string, unknown> = {};
    buildIncrementSetClause(bindings, { credits: -5 }, undefined, identity);
    expect(bindings.inc_credits).toBe(-5);
  });

  test("combines set assignments with increments", () => {
    const bindings: Record<string, unknown> = {};
    const clause = buildIncrementSetClause(
      bindings,
      { attempts: 1 },
      { status: "locked" },
      identity,
    );
    expect(clause).toBe(" SET status = $set_status, attempts += $inc_attempts");
    expect(bindings).toEqual({ set_status: "locked", inc_attempts: 1 });
  });

  test("maps field names through the resolver", () => {
    const bindings: Record<string, unknown> = {};
    const clause = buildIncrementSetClause(
      bindings,
      { failedAttempts: 2 },
      undefined,
      (field) => (field === "failedAttempts" ? "failed_attempts" : field),
    );
    expect(clause).toBe(" SET failed_attempts += $inc_failed_attempts");
    expect(bindings.inc_failed_attempts).toBe(2);
  });

  test("binds undefined set values as null", () => {
    const bindings: Record<string, unknown> = {};
    buildIncrementSetClause(bindings, {}, { revokedAt: undefined }, identity);
    expect(bindings.set_revokedAt).toBeNull();
  });

  test("returns null when there is nothing to assign", () => {
    expect(buildIncrementSetClause({}, {}, undefined, identity)).toBeNull();
    expect(buildIncrementSetClause({}, {}, {}, identity)).toBeNull();
  });
});
