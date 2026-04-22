import { describe, beforeAll, afterAll, beforeEach, test, expect } from "vitest";
import { Surreal } from "surrealdb";
import { surrealdbAdapter } from "../src/index.js";
import type { BetterAuthOptions } from "better-auth";

const SCHEMA = `
  DEFINE TABLE OVERWRITE user SCHEMAFULL;
  DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;
  DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;
  DEFINE FIELD OVERWRITE emailVerified ON TABLE user TYPE bool;
  DEFINE FIELD OVERWRITE image ON TABLE user TYPE option<string>;
  DEFINE FIELD OVERWRITE createdAt ON TABLE user TYPE datetime;
  DEFINE FIELD OVERWRITE updatedAt ON TABLE user TYPE datetime;
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
    const url = process.env["SURREALDB_URL"] ?? "ws://127.0.0.1:8000/rpc";
    const user = process.env["SURREALDB_USER"] ?? "root";
    const pass = process.env["SURREALDB_PASS"] ?? "root";
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
      data: { name: "Alice", email: "alice@test.com", emailVerified: true, createdAt: now, updatedAt: now },
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
      data: { name: "Bob", email: "bob@test.com", emailVerified: false, createdAt: now, updatedAt: now },
    });
    const found = await adapterInstance.findOne({
      model: "user",
      where: [{ field: "id", value: created.id, operator: "eq", connector: "AND", mode: "sensitive" }],
    });
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("Bob");
  });

  test("findOne: returns null when not found", async () => {
    const result = await adapterInstance.findOne({
      model: "user",
      where: [{ field: "email", value: "nobody@test.com", operator: "eq", connector: "AND", mode: "sensitive" }],
    });
    expect(result).toBeNull();
  });

  test("findMany: retrieves multiple users", async () => {
    const now = new Date();
    await adapterInstance.create({ model: "user", data: { name: "C1", email: "c1@test.com", emailVerified: true, createdAt: now, updatedAt: now } });
    await adapterInstance.create({ model: "user", data: { name: "C2", email: "c2@test.com", emailVerified: true, createdAt: now, updatedAt: now } });
    const results = await adapterInstance.findMany({ model: "user", limit: 10 });
    expect(results.length).toBe(2);
  });

  test("findMany: respects limit and offset", async () => {
    const now = new Date();
    for (let i = 0; i < 5; i++) {
      await adapterInstance.create({ model: "user", data: { name: `User${i}`, email: `u${i}@test.com`, emailVerified: true, createdAt: now, updatedAt: now } });
    }
    const page = await adapterInstance.findMany({ model: "user", limit: 2, offset: 2 });
    expect(page.length).toBe(2);
  });

  test("count: returns correct count", async () => {
    const now = new Date();
    await adapterInstance.create({ model: "user", data: { name: "D1", email: "d1@test.com", emailVerified: true, createdAt: now, updatedAt: now } });
    await adapterInstance.create({ model: "user", data: { name: "D2", email: "d2@test.com", emailVerified: true, createdAt: now, updatedAt: now } });
    const count = await adapterInstance.count({ model: "user" });
    expect(count).toBe(2);
  });

  test("update: merges new values and returns updated record", async () => {
    const now = new Date();
    const created = await adapterInstance.create({
      model: "user",
      data: { name: "Eve", email: "eve@test.com", emailVerified: false, createdAt: now, updatedAt: now },
    });
    const updated = await adapterInstance.update({
      model: "user",
      where: [{ field: "id", value: created.id, operator: "eq", connector: "AND", mode: "sensitive" }],
      update: { emailVerified: true },
    });
    expect(updated).not.toBeNull();
    expect(updated!.emailVerified).toBe(true);
    expect(updated!.name).toBe("Eve");
  });

  test("updateMany: updates multiple records and returns count", async () => {
    const now = new Date();
    await adapterInstance.create({ model: "user", data: { name: "F1", email: "f1@test.com", emailVerified: false, createdAt: now, updatedAt: now } });
    await adapterInstance.create({ model: "user", data: { name: "F2", email: "f2@test.com", emailVerified: false, createdAt: now, updatedAt: now } });
    const count = await adapterInstance.updateMany({
      model: "user",
      where: [{ field: "emailVerified", value: false, operator: "eq", connector: "AND", mode: "sensitive" }],
      update: { emailVerified: true },
    });
    expect(count).toBe(2);
  });

  test("delete: removes a record", async () => {
    const now = new Date();
    const created = await adapterInstance.create({
      model: "user",
      data: { name: "Grace", email: "grace@test.com", emailVerified: false, createdAt: now, updatedAt: now },
    });
    await adapterInstance.delete({
      model: "user",
      where: [{ field: "id", value: created.id, operator: "eq", connector: "AND", mode: "sensitive" }],
    });
    const found = await adapterInstance.findOne({
      model: "user",
      where: [{ field: "id", value: created.id, operator: "eq", connector: "AND", mode: "sensitive" }],
    });
    expect(found).toBeNull();
  });

  test("deleteMany: removes multiple records and returns count", async () => {
    const now = new Date();
    await adapterInstance.create({ model: "user", data: { name: "H1", email: "h1@test.com", emailVerified: false, createdAt: now, updatedAt: now } });
    await adapterInstance.create({ model: "user", data: { name: "H2", email: "h2@test.com", emailVerified: false, createdAt: now, updatedAt: now } });
    const count = await adapterInstance.deleteMany({
      model: "user",
      where: [{ field: "emailVerified", value: false, operator: "eq", connector: "AND", mode: "sensitive" }],
    });
    expect(count).toBe(2);
  });

  test("create: session record with userId as RecordId reference", async () => {
    const now = new Date();
    const user = await adapterInstance.create({
      model: "user",
      data: { name: "Ivan", email: "ivan@test.com", emailVerified: true, createdAt: now, updatedAt: now },
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
    const sessionFactory = surrealdbAdapter(session, { idGenerator: "surreal.ULID" });
    const sessionAdapter = sessionFactory({} as BetterAuthOptions);
    const now = new Date();
    const result = await sessionAdapter.create({
      model: "user",
      data: { name: "Jay", email: "jay@test.com", emailVerified: false, createdAt: now, updatedAt: now },
    });
    expect(result.id).toContain("user:");
    await session.closeSession();
  });

  test("allowPassingId: uses custom id when allowPassingId is true", async () => {
    const factory = surrealdbAdapter(db, { idGenerator: "surreal.ULID", allowPassingId: true });
    const a = factory({} as BetterAuthOptions);
    const now = new Date();
    // forceAllowId: true is required so Better Auth passes the id field through to the adapter
    const result = await a.create({
      model: "user",
      data: { id: "user:custom-id-123", name: "Kai", email: "kai@test.com", emailVerified: false, createdAt: now, updatedAt: now },
      forceAllowId: true,
    });
    expect(result.id).toContain("custom-id-123");
  });
});
