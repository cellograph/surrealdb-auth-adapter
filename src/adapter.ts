import { BoundQuery, RecordId, Uuid } from "surrealdb";
import type { SurrealSession } from "surrealdb";
import { createAdapterFactory } from "better-auth/adapters";
import type { AdapterFactory, CleanedWhere, CustomAdapter } from "better-auth/adapters";
import type { BetterAuthOptions } from "better-auth";
import { mapNullToUndefined, recordIdsToStrings, toRecordId } from "./record-id.js";
import { buildWhereClause } from "./where-clause.js";
import type { WhereContext } from "./where-clause.js";
import {
  buildCreateQuery,
  buildQuerySuffix,
  buildRecordIdMap,
  extractDirectRecords,
} from "./query-builder.js";
import { generateSchema } from "./schema.js";
import {
  DEFAULT_FIELD_REFERENCES,
  FIELD_MAPPING_RULES,
} from "./types.js";
import type { AdapterMethod, RecordIdMap, SurrealAdapterConfig } from "./types.js";

export const surrealdbAdapter = (
  db: SurrealSession,
  config?: SurrealAdapterConfig,
): AdapterFactory<BetterAuthOptions> =>
  createAdapterFactory({
    config: {
      adapterId: "surrealdb-auth-adapter",
      adapterName: "surrealdb-auth-adapter",
      usePlural: config?.usePlural ?? false,
      debugLogs: config?.debugLogs ?? false,
      supportsNumericIds: false,
      supportsBooleans: true,
      supportsDates: true,
      supportsJSON: true,
      supportsArrays: false,
      disableIdGeneration: config?.idGenerator?.startsWith("surreal") ?? false,
    },
    adapter: ({ options, getModelName, getFieldName, getDefaultModelName, getDefaultFieldName, debugLog }) => {
      const optionsAsAny = options as Record<string, unknown>;
      const schemaTables = (optionsAsAny["schema"] as Record<string, unknown> | undefined)?.[
        "tables"
      ] as Record<string, { fields?: Record<string, { references?: { model: string } }> }> | undefined ?? {};

      const recordIdMap: RecordIdMap = buildRecordIdMap(
        schemaTables,
        getModelName,
        getFieldName,
      );

      const advancedDb = ((optionsAsAny["advanced"] as Record<string, unknown> | undefined)?.["database"]) as Record<string, unknown> | undefined;
      const generateId: (() => string) | undefined =
        advancedDb?.["generateId"] as (() => string) | undefined;

      function buildSpecialCases(): Record<string, Record<string, { recordTable: string; condition?: (d: Record<string, unknown>) => boolean }>> {
        const cases: Record<string, Record<string, { recordTable: string; condition?: (d: Record<string, unknown>) => boolean }>> = {};
        for (const rule of FIELD_MAPPING_RULES) {
          try {
            const src = getModelName(rule.sourceModel);
            const tgt = getModelName(rule.targetModel);
            const field = getFieldName({ model: rule.sourceModel, field: rule.sourceField });
            if (!cases[src]) cases[src] = {};
            cases[src]![field] = { recordTable: tgt, condition: rule.condition };
          } catch { /* model not in schema */ }
        }
        return cases;
      }

      const specialCases = buildSpecialCases();

      function getReferencedModel(tableName: string, fieldName: string): string | null {
        const defaultModel = getDefaultModelName(tableName);
        const defaultField = getDefaultFieldName({ model: defaultModel, field: fieldName });
        const canonical = DEFAULT_FIELD_REFERENCES[defaultField];
        if (canonical) {
          try { return getModelName(canonical); } catch { /* not in schema */ }
        }
        return recordIdMap.tableSpecific[tableName]?.[fieldName] ?? null;
      }

      const whereCtx: WhereContext = { getModelName, getFieldName, getReferencedModel };

      function serializeRecordIdFields(
        tableName: string,
        data: Record<string, unknown>,
      ): Record<string, unknown> {
        const out = { ...data };
        for (const fieldName of Object.keys(out)) {
          const value = out[fieldName];
          if (typeof value !== "string" || !value) continue;
          const sc = specialCases[tableName]?.[fieldName];
          if (sc) {
            if (!sc.condition || sc.condition(out)) {
              out[fieldName] = toRecordId(sc.recordTable, value);
            }
          } else {
            const ref = getReferencedModel(tableName, fieldName);
            if (ref) out[fieldName] = toRecordId(ref, value);
          }
        }
        return out;
      }

      function logQuery(method: AdapterMethod, query: BoundQuery): void {
        if (!config?.debugLogs) return;
        if (typeof config.debugLogs === "object" && !("isRunningAdapterTests" in config.debugLogs)) {
          const opts = config.debugLogs as Record<string, unknown>;
          if (typeof opts["logCondition"] === "function" && !(opts["logCondition"] as () => boolean)()) return;
          if (method in opts && !opts[method]) return;
        }
        let readable = query.query;
        for (const [name, val] of Object.entries(query.bindings)) {
          readable = readable.replace(
            new RegExp(`\\$${name}\\b`, "g"),
            val instanceof RecordId ? val.toString() : JSON.stringify(val),
          );
        }
        debugLog(`\x1b[1m[surrealdb-auth-adapter]\x1b[0m \x1b[2m${method}\x1b[0m\n\n  \x1b[38;5;200m${readable}\x1b[0m\n`);
      }

      async function runQuery(
        method: AdapterMethod,
        model: string,
        tableName: string,
        where: CleanedWhere[],
        scanQuery: string,
        directQuery: ((ids: RecordId[]) => string) | undefined,
        bindings: Record<string, unknown>,
        suffix: string,
      ): Promise<unknown[]> {
        const direct = directQuery ? extractDirectRecords(where, tableName) : null;
        let qs: string;

        if (direct && directQuery) {
          const { recordIds, remainingWhere } = direct;
          const whereStr = buildWhereClause(bindings, remainingWhere, model, whereCtx, config);
          qs = directQuery(recordIds) + whereStr + suffix;
        } else {
          const whereStr = buildWhereClause(bindings, where, model, whereCtx, config);
          qs = scanQuery + whereStr + suffix;
        }

        const bound = new BoundQuery(qs, bindings);
        logQuery(method, bound);
        const [rows] = await db.query<[unknown[]]>(bound).collect();
        if (rows === null || rows === undefined) return [];
        // SurrealDB returns a plain object (not array) for ONLY queries
        if (!Array.isArray(rows)) return [rows];
        return rows;
      }

      // Cast to CustomAdapter to satisfy the generic method return types.
      // The actual runtime values are compatible; TypeScript just can't verify
      // that `recordIdsToStrings(x)` satisfies `T` for arbitrary generic T.
      return ({
        async create({ model, data, select }) {
          const tableName = getModelName(model);
          const cleaned = serializeRecordIdFields(
            tableName,
            mapNullToUndefined(data as Record<string, unknown>),
          );

          let customId: string | undefined;
          if (config?.idGenerator === "sdk.UUIDv4") {
            customId = Uuid.v4().toString();
          } else if (config?.idGenerator === "sdk.UUIDv7") {
            customId = Uuid.v7().toString();
          } else if (config?.allowPassingId && typeof cleaned["id"] === "string") {
            customId = cleaned["id"];
          }
          delete cleaned["id"];

          let selectFields: string | undefined;
          if (Array.isArray(select) && select.length > 0) {
            const fields = select.map((f) => getFieldName({ model, field: f }));
            if (!fields.includes("id")) fields.unshift("id");
            selectFields = fields.join(", ");
          }

          const query = buildCreateQuery(tableName, cleaned, config, customId, selectFields, generateId);
          logQuery("create", query);
          const [rows] = await db.query<[unknown[]]>(query).collect();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return recordIdsToStrings((rows as unknown[])[0]) as any;
        },

        async findOne({ model, where, select }) {
          const tableName = getModelName(model);
          const fields = Array.isArray(select)
            ? select.map((f) => getFieldName({ model, field: f })).join(", ")
            : "*";
          const suffix = buildQuerySuffix({ limitOne: true });
          const rows = await runQuery(
            "findOne", model, tableName, where,
            `SELECT ${fields} FROM ONLY ${tableName}`,
            (ids) => `SELECT ${fields} FROM ONLY ${ids[0]!.toString()}`,
            {}, suffix,
          );
          return recordIdsToStrings(rows[0] ?? null);
        },

        async findMany({ model, where = [], limit, offset, sortBy }) {
          const tableName = getModelName(model);
          const suffix = buildQuerySuffix({ limit, offset, sortBy, model }, getFieldName);
          const rows = await runQuery(
            "findMany", model, tableName, where,
            `SELECT * FROM ${tableName}`,
            (ids) => `SELECT * FROM [${ids.map((r) => r.toString()).join(", ")}]`,
            {}, suffix,
          );
          return recordIdsToStrings(rows);
        },

        async count({ model, where = [] }) {
          const tableName = getModelName(model);
          const suffix = buildQuerySuffix({ groupAll: true });
          const rows = await runQuery(
            "count", model, tableName, where,
            `SELECT count() FROM ${tableName}`,
            (ids) => `SELECT count() FROM [${ids.map((r) => r.toString()).join(", ")}]`,
            {}, suffix,
          );
          return (rows[0] as Record<string, unknown>)?.["count"] as number ?? 0;
        },

        async update({ model, where, update: values }) {
          const tableName = getModelName(model);
          const content = serializeRecordIdFields(
            tableName,
            mapNullToUndefined(values as Record<string, unknown>),
          );
          const suffix = buildQuerySuffix({ returnAfter: true });
          const rows = await runQuery(
            "update", model, tableName, where,
            `UPDATE ONLY ${tableName} MERGE $content`,
            (ids) => `UPDATE ONLY ${ids[0]!.toString()} MERGE $content`,
            { content }, suffix,
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return recordIdsToStrings(rows[0] ?? null) as any;
        },

        async updateMany({ model, where, update: values }) {
          const tableName = getModelName(model);
          const content = serializeRecordIdFields(
            tableName,
            mapNullToUndefined(values as Record<string, unknown>),
          );
          const rows = await runQuery(
            "updateMany", model, tableName, where,
            `UPDATE ${tableName} MERGE $content`,
            (ids) => `UPDATE [${ids.map((r) => r.toString()).join(", ")}] MERGE $content`,
            { content }, "",
          );
          return (rows as unknown[]).length;
        },

        async delete({ model, where }) {
          const tableName = getModelName(model);
          await runQuery(
            "delete", model, tableName, where,
            `DELETE ${tableName}`,
            (ids) => `DELETE ${ids[0]!.toString()}`,
            {}, "",
          );
        },

        async deleteMany({ model, where }) {
          const tableName = getModelName(model);
          // COUNT before deleting — SurrealDB DELETE returns [] so we can't infer count from result
          const countRows = await runQuery(
            "deleteMany", model, tableName, where,
            `SELECT count() FROM ${tableName}`,
            (ids) => `SELECT count() FROM [${ids.map((r) => r.toString()).join(", ")}]`,
            {}, " GROUP ALL",
          );
          const count = (countRows[0] as Record<string, unknown>)?.["count"] as number ?? 0;
          await runQuery(
            "deleteMany", model, tableName, where,
            `DELETE ${tableName}`,
            (ids) => `DELETE [${ids.map((r) => r.toString()).join(", ")}]`,
            {}, "",
          );
          return count;
        },

        async createSchema({ file, tables }) {
          return generateSchema({
            file,
            tables,
            getModelName,
            getFieldName,
            getReferencedModel,
          });
        },
      }) as CustomAdapter;
    },
  });
