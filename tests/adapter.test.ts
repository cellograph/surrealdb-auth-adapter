import type { BetterAuthOptions } from "better-auth";
import { Surreal } from "surrealdb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { surrealdbAdapter } from "../src/index.js";

const SCHEMA = `
  DEFINE TABLE OVERWRITE user SCHEMAFULL;
  DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;
  DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;
  DEFINE FIELD OVERWRITE emailVerified ON TABLE user TYPE bool;
  DEFINE FIELD OVERWRITE image ON TABLE user TYPE option<string>;
  DEFINE FIELD OVERWRITE createdAt ON TABLE user TYPE datetime;
  DEFINE FIELD OVERWRITE updatedAt ON TABLE user TYPE datetime;
  DEFINE FIELD OVERWRITE status ON TABLE user TYPE option<string>;
  DEFINE FIELD OVERWRITE attempts ON TABLE user TYPE option<number>;
  DEFINE INDEX OVERWRITE idx_user_email ON user COLUMNS email UNIQUE;

  DEFINE TABLE OVERWRITE session SCHEMAFULL;
  DEFINE FIELD OVERWRITE expiresAt ON TABLE session TYPE datetime;
  DEFINE FIELD OVERWRITE token ON TABLE session TYPE string;
  DEFINE FIELD OVERWRITE createdAt ON TABLE session TYPE datetime;
  DEFINE FIELD OVERWRITE updatedAt ON TABLE session TYPE datetime;
  DEFINE FIELD OVERWRITE ipAddress ON TABLE session TYPE option<string>;
  DEFINE FIELD OVERWRITE userAgent ON TABLE session TYPE option<string>;
  DEFINE FIELD OVERWRITE userId ON TABLE session TYPE record<user>;
  DEFINE INDEX OVERWRITE idx_session_token ON session COLUMNS token UNIQUE;
  DEFINE INDEX OVERWRITE idx_session_userId ON session COLUMNS userId;
`;

describe("surrealdbAdapter integration", () => {
  const db = new Surreal();
  let adapterInstance: ReturnType<ReturnType<typeof surrealdbAdapter>>;

  beforeAll(async () => {
    const url = process.env.SURREALDB_URL ?? "ws://127.0.0.1:8000/rpc";
    const user = process.env.SURREALDB_USER ?? "root";
    const pass = process.env.SURREALDB_PASS ?? "root";
    await db.connect(url);
    await db.signin({ username: user, password: pass });
    await db.use({ namespace: "test", database: "adapter_integration_test" });
    await db.query(SCHEMA);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query("DELETE user; DELETE session;");
    const factory = surrealdbAdapter(db, { idGenerator: "surreal.ULID" });
    adapterInstance = factory({} as BetterAuthOptions);
  });

  test("create: inserts a user and returns it with a string id", async () => {
    const now = new Date();
    const result = await adapterInstance.create({
      model: "user",
      data: {
        name: "Alice",
        email: "alice@test.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(result.id).toBeDefined();
    expect(typeof result.id).toBe("string");
    expect(result.id).toContain("user:");
    expect(result.name).toBe("Alice");
    expect(result.email).toBe("alice@test.com");
  });

  test("findOne: retrieves a user by id", async () => {
    const now = new Date();
    const created = await adapterInstance.create({
      model: "user",
      data: {
        name: "Bob",
        email: "bob@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    const found = await adapterInstance.findOne({
      model: "user",
      where: [
        {
          field: "id",
          value: created.id,
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
    });
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe("Bob");
  });

  test("findOne: returns null when not found", async () => {
    const result = await adapterInstance.findOne({
      model: "user",
      where: [
        {
          field: "email",
          value: "nobody@test.com",
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
    });
    expect(result).toBeNull();
  });

  test("findMany: retrieves multiple users", async () => {
    const now = new Date();
    await adapterInstance.create({
      model: "user",
      data: {
        name: "C1",
        email: "c1@test.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    await adapterInstance.create({
      model: "user",
      data: {
        name: "C2",
        email: "c2@test.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    const results = await adapterInstance.findMany({
      model: "user",
      limit: 10,
    });
    expect(results.length).toBe(2);
  });

  test("findMany: respects limit and offset", async () => {
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      await adapterInstance.create({
        model: "user",
        data: {
          name: `User${i}`,
          email: `u${i}@test.com`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    const page = await adapterInstance.findMany({
      model: "user",
      limit: 2,
      offset: 2,
    });
    expect(page.length).toBe(2);
  });

  test("count: returns correct count", async () => {
    const now = new Date();
    await adapterInstance.create({
      model: "user",
      data: {
        name: "D1",
        email: "d1@test.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    await adapterInstance.create({
      model: "user",
      data: {
        name: "D2",
        email: "d2@test.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    const count = await adapterInstance.count({ model: "user" });
    expect(count).toBe(2);
  });

  test("update: merges new values and returns updated record", async () => {
    const now = new Date();
    const created = await adapterInstance.create({
      model: "user",
      data: {
        name: "Eve",
        email: "eve@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    const updated = await adapterInstance.update({
      model: "user",
      where: [
        {
          field: "id",
          value: created.id,
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
      update: { emailVerified: true },
    });
    expect(updated).not.toBeNull();
    expect(updated?.emailVerified).toBe(true);
    expect(updated?.name).toBe("Eve");
  });

  test("updateMany: updates multiple records and returns count", async () => {
    const now = new Date();
    await adapterInstance.create({
      model: "user",
      data: {
        name: "F1",
        email: "f1@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    await adapterInstance.create({
      model: "user",
      data: {
        name: "F2",
        email: "f2@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    const count = await adapterInstance.updateMany({
      model: "user",
      where: [
        {
          field: "emailVerified",
          value: false,
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
      update: { emailVerified: true },
    });
    expect(count).toBe(2);
  });

  test("delete: removes a record", async () => {
    const now = new Date();
    const created = await adapterInstance.create({
      model: "user",
      data: {
        name: "Grace",
        email: "grace@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    await adapterInstance.delete({
      model: "user",
      where: [
        {
          field: "id",
          value: created.id,
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
    });
    const found = await adapterInstance.findOne({
      model: "user",
      where: [
        {
          field: "id",
          value: created.id,
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
    });
    expect(found).toBeNull();
  });

  test("deleteMany: removes multiple records and returns count", async () => {
    const now = new Date();
    await adapterInstance.create({
      model: "user",
      data: {
        name: "H1",
        email: "h1@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    await adapterInstance.create({
      model: "user",
      data: {
        name: "H2",
        email: "h2@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    const count = await adapterInstance.deleteMany({
      model: "user",
      where: [
        {
          field: "emailVerified",
          value: false,
          operator: "eq",
          connector: "AND",
          mode: "sensitive",
        },
      ],
    });
    expect(count).toBe(2);
  });

  test("create: session record with userId as RecordId reference", async () => {
    const now = new Date();
    const user = await adapterInstance.create({
      model: "user",
      data: {
        name: "Ivan",
        email: "ivan@test.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    const session = await adapterInstance.create({
      model: "session",
      data: {
        userId: user.id,
        token: "tok-abc",
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(session.id).toContain("session:");
    expect(session.userId).toContain("user:");
  });

  test("accepts a SurrealSession instance", async () => {
    // forkSession() clones the current session including auth/namespace/database context
    const session = await db.forkSession();
    const sessionFactory = surrealdbAdapter(session, {
      idGenerator: "surreal.ULID",
    });
    const sessionAdapter = sessionFactory({} as BetterAuthOptions);
    const now = new Date();
    const result = await sessionAdapter.create({
      model: "user",
      data: {
        name: "Jay",
        email: "jay@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(result.id).toContain("user:");
    await session.closeSession();
  });

  test("allowPassingId: uses custom id when allowPassingId is true", async () => {
    const factory = surrealdbAdapter(db, {
      idGenerator: "surreal.ULID",
      allowPassingId: true,
    });
    const a = factory({} as BetterAuthOptions);
    const now = new Date();
    // forceAllowId: true is required so Better Auth passes the id field through to the adapter
    const result = await a.create({
      model: "user",
      data: {
        id: "user:custom-id-123",
        name: "Kai",
        email: "kai@test.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
      forceAllowId: true,
    });
    expect(result.id).toContain("custom-id-123");
  });
  // `status` and `attempts` are declared as additional fields so Better Auth's
  // transformInput keeps them instead of stripping them as unknown columns.
  const COUNTER_OPTIONS = {
    user: {
      additionalFields: {
        status: { type: "string", required: false },
        attempts: { type: "number", required: false },
      },
    },
  } as unknown as BetterAuthOptions;

  function counterAdapter() {
    return surrealdbAdapter(db, { idGenerator: "surreal.ULID" })(
      COUNTER_OPTIONS,
    );
  }

  async function seedUser(
    a: ReturnType<typeof counterAdapter>,
    name: string,
    email: string,
    extra: { status?: string; attempts?: number } = {},
  ) {
    const now = new Date();
    return a.create<Record<string, unknown>>({
      model: "user",
      data: {
        name,
        email,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
        ...extra,
      },
    });
  }

  describe("consumeOne", () => {
    test("deletes and returns the matching row", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Consume", "consume@test.com");
      const consumed = await a.consumeOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
      });
      expect(consumed).not.toBeNull();
      expect(consumed?.email).toBe("consume@test.com");

      const after = await a.findOne({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
      });
      expect(after).toBeNull();
    });

    test("returns null when nothing matches", async () => {
      const a = counterAdapter();
      const consumed = await a.consumeOne({
        model: "user",
        where: [{ field: "email", value: "does-not-exist@test.com" }],
      });
      expect(consumed).toBeNull();
    });

    test("deletes at most one row when several match", async () => {
      const a = counterAdapter();
      await seedUser(a, "Shared", "shared1@test.com");
      await seedUser(a, "Shared", "shared2@test.com");
      const consumed = await a.consumeOne({
        model: "user",
        where: [{ field: "name", value: "Shared" }],
      });
      expect(consumed).not.toBeNull();
      const remaining = await a.count({
        model: "user",
        where: [{ field: "name", value: "Shared" }],
      });
      expect(remaining).toBe(1);
    });

    test("honours a guard alongside a direct record id", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Guarded", "guarded@test.com", {
        status: "approved",
      });
      const blocked = await a.consumeOne({
        model: "user",
        where: [
          { field: "id", value: created.id as string },
          { field: "status", value: "pending" },
        ],
      });
      expect(blocked).toBeNull();

      const allowed = await a.consumeOne<Record<string, unknown>>({
        model: "user",
        where: [
          { field: "id", value: created.id as string },
          { field: "status", value: "approved" },
        ],
      });
      expect(allowed?.email).toBe("guarded@test.com");
    });

    test("consumes exactly once under concurrency", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Race", "race@test.com");
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          a.consumeOne({
            model: "user",
            where: [{ field: "id", value: created.id as string }],
          }),
        ),
      );
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });
  });

  describe("incrementOne", () => {
    test("increments a counter and returns the updated row", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Inc", "inc-a@test.com", {
        attempts: 2,
      });
      const updated = await a.incrementOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
        increment: { attempts: 1 },
      });
      expect(updated?.attempts).toBe(3);
    });

    test("supports negative deltas", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Dec", "inc-b@test.com", {
        attempts: 5,
      });
      const updated = await a.incrementOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
        increment: { attempts: -2 },
      });
      expect(updated?.attempts).toBe(3);
    });

    test("applies set assignments in the same statement", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Both", "inc-c@test.com", {
        attempts: 0,
      });
      const updated = await a.incrementOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
        increment: { attempts: 1 },
        set: { status: "locked" },
      });
      expect(updated?.attempts).toBe(1);
      expect(updated?.status).toBe("locked");
    });

    test("returns null and writes nothing when the guard fails", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "Guard", "inc-d@test.com", {
        attempts: 0,
        status: "open",
      });
      const updated = await a.incrementOne({
        model: "user",
        where: [
          { field: "id", value: created.id as string },
          { field: "status", value: "closed" },
        ],
        increment: { attempts: 1 },
      });
      expect(updated).toBeNull();

      const untouched = await a.findOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
      });
      expect(untouched?.attempts).toBe(0);
    });

    test("does not error when several rows match the scan path", async () => {
      const a = counterAdapter();
      await seedUser(a, "Many", "inc-e@test.com", { attempts: 0 });
      await seedUser(a, "Many", "inc-f@test.com", { attempts: 0 });
      const updated = await a.incrementOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "name", value: "Many" }],
        increment: { attempts: 1 },
      });
      expect(updated?.attempts).toBe(1);
    });

    test("loses no increments under concurrency", async () => {
      const a = counterAdapter();
      const created = await seedUser(a, "IncRace", "inc-race@test.com", {
        attempts: 0,
      });
      await Promise.all(
        Array.from({ length: 10 }, () =>
          a.incrementOne({
            model: "user",
            where: [{ field: "id", value: created.id as string }],
            increment: { attempts: 1 },
          }),
        ),
      );
      const final = await a.findOne<Record<string, unknown>>({
        model: "user",
        where: [{ field: "id", value: created.id as string }],
      });
      expect(final?.attempts).toBe(10);
    });
  });

  describe("update", () => {
    test("updates one row instead of erroring when several match", async () => {
      const a = counterAdapter();
      await seedUser(a, "Duplicate", "dup1@test.com");
      await seedUser(a, "Duplicate", "dup2@test.com");
      const updated = await a.update<Record<string, unknown>>({
        model: "user",
        where: [{ field: "name", value: "Duplicate" }],
        update: { name: "Renamed" },
      });
      expect(updated?.name).toBe("Renamed");
      expect(
        await a.count({
          model: "user",
          where: [{ field: "name", value: "Duplicate" }],
        }),
      ).toBe(1);
    });

    test("returns null when no row matches", async () => {
      const a = counterAdapter();
      const updated = await a.update({
        model: "user",
        where: [{ field: "email", value: "nobody@test.com" }],
        update: { name: "Ghost" },
      });
      expect(updated).toBeNull();
    });
  });

  describe("transaction", () => {
    test("commits every write when the callback resolves", async () => {
      const a = counterAdapter();
      await a.transaction(async (trx) => {
        await seedUser(
          trx as unknown as ReturnType<typeof counterAdapter>,
          "TxA",
          "tx-a@test.com",
        );
        await seedUser(
          trx as unknown as ReturnType<typeof counterAdapter>,
          "TxB",
          "tx-b@test.com",
        );
      });
      expect(await a.count({ model: "user" })).toBe(2);
    });

    test("rolls every write back when the callback throws", async () => {
      const a = counterAdapter();
      await expect(
        a.transaction(async (trx) => {
          await seedUser(
            trx as unknown as ReturnType<typeof counterAdapter>,
            "TxC",
            "tx-c@test.com",
          );
          throw new Error("rollback please");
        }),
      ).rejects.toThrow("rollback please");
      expect(await a.count({ model: "user" })).toBe(0);
    });

    test("returns the callback result", async () => {
      const a = counterAdapter();
      const result = await a.transaction(async () => "done");
      expect(result).toBe("done");
    });

    test("keeps concurrent transactions isolated from one another", async () => {
      const a = counterAdapter();
      const [, rejected] = await Promise.allSettled([
        a.transaction(async (trx) => {
          await seedUser(
            trx as unknown as ReturnType<typeof counterAdapter>,
            "Keep",
            "keep@test.com",
          );
        }),
        a.transaction(async (trx) => {
          await seedUser(
            trx as unknown as ReturnType<typeof counterAdapter>,
            "Drop",
            "drop@test.com",
          );
          throw new Error("discard this one");
        }),
      ]);
      expect(rejected?.status).toBe("rejected");
      // The committed transaction survives; the cancelled one leaves nothing.
      expect(
        await a.count({
          model: "user",
          where: [{ field: "name", value: "Keep" }],
        }),
      ).toBe(1);
      expect(
        await a.count({
          model: "user",
          where: [{ field: "name", value: "Drop" }],
        }),
      ).toBe(0);
    });
  });
});
