import { RecordId } from "surrealdb";
import type { CleanedWhere } from "better-auth/adapters";
import { toRecordId } from "./record-id.js";
import { COMPARISON_OPERATORS } from "./types.js";
import type { SurrealAdapterConfig } from "./types.js";

export interface WhereContext {
  getModelName: (model: string) => string;
  getFieldName: (opts: { model: string; field: string }) => string;
  getReferencedModel: (table: string, field: string) => string | null;
}

export function buildWhereClause(
  bindings: Record<string, unknown>,
  where: CleanedWhere[],
  model: string,
  ctx: WhereContext,
  config?: SurrealAdapterConfig,
): string {
  if (where.length === 0) return "";

  const tableName = ctx.getModelName(model);
  const conditions: string[] = [];

  for (let idx = 0; idx < where.length; idx++) {
    const item = where[idx]!;
    const { field: internalField, value, operator, connector, mode } = item;

    if (operator === "in" && Array.isArray(value) && value.length === 0) continue;
    if (operator === "not_in" && Array.isArray(value) && value.length === 0) continue;

    const fieldName = ctx.getFieldName({ model, field: internalField });
    const param = `where_${idx}`;
    const insensitive = mode === "insensitive" && typeof value === "string";

    let conditionStr: string;

    if (operator === "in" || operator === "not_in") {
      const keyword = operator === "in" ? "IN" : "NOT IN";
      conditionStr = `${fieldName} ${keyword} $${param}`;
      const vals = Array.isArray(value) ? value : [value];
      if (internalField === "id") {
        bindings[param] = vals.map((v) => toRecordId(tableName, v));
      } else {
        const ref = ctx.getReferencedModel(tableName, fieldName);
        bindings[param] = ref
          ? vals.map((v) => (typeof v === "string" ? toRecordId(ref, v) : v))
          : vals;
      }
    } else if (operator === "contains") {
      conditionStr = insensitive
        ? `string::lowercase(${fieldName}) CONTAINS string::lowercase($${param})`
        : `${fieldName} CONTAINS $${param}`;
      bindings[param] = value;
    } else if (operator === "starts_with") {
      conditionStr = insensitive
        ? `string::starts_with(string::lowercase(${fieldName}), string::lowercase($${param}))`
        : `string::starts_with(${fieldName}, $${param})`;
      bindings[param] = value;
    } else if (operator === "ends_with") {
      conditionStr = insensitive
        ? `string::ends_with(string::lowercase(${fieldName}), string::lowercase($${param}))`
        : `string::ends_with(${fieldName}, $${param})`;
      bindings[param] = value;
    } else if (operator in COMPARISON_OPERATORS) {
      const op = COMPARISON_OPERATORS[operator]!;
      if (insensitive) {
        conditionStr = `string::lowercase(${fieldName}) ${op} string::lowercase($${param})`;
        bindings[param] = value;
      } else {
        conditionStr = `${fieldName} ${op} $${param}`;
        if (internalField === "id") {
          bindings[param] = toRecordId(tableName, value);
        } else {
          const ref = ctx.getReferencedModel(tableName, fieldName);
          bindings[param] = ref && typeof value === "string" ? toRecordId(ref, value) : value;
        }
      }
    } else {
      if (config?.strictOperators) {
        throw new Error(`[surrealdb-auth-adapter]: Unknown operator '${operator}'`);
      }
      conditionStr = `${fieldName} = $${param}`;
      bindings[param] = value;
    }

    conditions.push(
      conditions.length > 0
        ? ` ${connector.toUpperCase()} ${conditionStr}`
        : conditionStr,
    );
  }

  if (conditions.length === 0) return "";
  return ` WHERE ${conditions.join("")}`;
}
