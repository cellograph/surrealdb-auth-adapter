import { BoundQuery, RecordId } from "surrealdb";
import type { CleanedWhere } from "better-auth/adapters";
import { toRecordId } from "./record-id.js";
import type { QuerySuffixOptions, RecordIdMap, SurrealAdapterConfig } from "./types.js";

export function buildQuerySuffix(
  opts: QuerySuffixOptions = {},
  getFieldName?: (opts: { model: string; field: string }) => string,
): string {
  const { sortBy, limit, offset, groupAll, returnAfter, returnFields, limitOne, model } = opts;
  let suffix = "";

  if (sortBy && model && getFieldName) {
    const field = getFieldName({ model, field: sortBy.field });
    suffix += ` ORDER BY ${field} ${sortBy.direction === "desc" ? "DESC" : "ASC"}`;
  }

  if (limitOne) {
    suffix += " LIMIT 1";
  } else if (typeof limit === "number") {
    suffix += ` LIMIT ${limit}`;
  }

  if (typeof offset === "number") suffix += ` START AT ${offset}`;
  if (groupAll) suffix += " GROUP ALL";
  if (returnAfter) suffix += " RETURN AFTER";
  else if (returnFields) suffix += ` RETURN ${returnFields}`;

  return suffix;
}

export function buildCreateQuery(
  tableName: string,
  content: Record<string, unknown>,
  config?: SurrealAdapterConfig,
  customId?: string,
  selectFields?: string,
  generateId?: () => string,
): BoundQuery {
  const providedId = customId ?? (generateId ? generateId() : null);
  let targetClause: string;

  if (providedId) {
    targetClause = toRecordId(tableName, providedId).toString();
  } else {
    switch (config?.idGenerator) {
      case "surreal.ULID":
        targetClause = `type::record('${tableName}', rand::ulid())`; break;
      case "surreal.UUID":
        targetClause = `type::record('${tableName}', rand::uuid())`; break;
      case "surreal.UUIDv4":
        targetClause = `type::record('${tableName}', rand::uuid::v4())`; break;
      case "surreal.UUIDv7":
        targetClause = `type::record('${tableName}', rand::uuid::v7())`; break;
      case "surreal.guid":
        targetClause = `type::record('${tableName}', rand::guid())`; break;
      default:
        targetClause = `type::record('${tableName}')`;
    }
  }

  const suffix = selectFields ? ` RETURN ${selectFields}` : "";
  return new BoundQuery(
    `CREATE ${targetClause} CONTENT $content${suffix}`,
    { content },
  );
}

export function extractDirectRecords(
  where: CleanedWhere[],
  tableName: string,
): { recordIds: RecordId[]; remainingWhere: CleanedWhere[] } | null {
  if (where.length === 0) return null;

  const eqIdx = where.findIndex((w) => w.field === "id" && w.operator === "eq");
  if (eqIdx !== -1) {
    return {
      recordIds: [toRecordId(tableName, where[eqIdx]!.value)],
      remainingWhere: where.filter((_, i) => i !== eqIdx),
    };
  }

  const inIdx = where.findIndex(
    (w) => w.field === "id" && w.operator === "in" && Array.isArray(w.value),
  );
  if (inIdx !== -1) {
    return {
      recordIds: (where[inIdx]!.value as unknown[]).map((id) => toRecordId(tableName, id)),
      remainingWhere: where.filter((_, i) => i !== inIdx),
    };
  }

  return null;
}

export function buildRecordIdMap(
  tables: Record<string, { fields?: Record<string, { references?: { model: string } }> }>,
  getModelName: (model: string) => string,
  getFieldName: (opts: { model: string; field: string }) => string,
): RecordIdMap {
  const map: RecordIdMap = { tableSpecific: {} };

  for (const internalModel of Object.keys(tables)) {
    const tableDef = tables[internalModel];
    if (!tableDef?.fields) continue;
    const tableName = getModelName(internalModel);
    if (!map.tableSpecific[tableName]) map.tableSpecific[tableName] = {};

    for (const internalField of Object.keys(tableDef.fields)) {
      const fieldDef = tableDef.fields[internalField];
      if (fieldDef?.references?.model) {
        const fieldName = getFieldName({ model: internalModel, field: internalField });
        map.tableSpecific[tableName]![fieldName] = getModelName(fieldDef.references.model);
      }
    }
  }

  return map;
}
