import type { DBAdapterSchemaCreation } from "better-auth/adapters";

interface GenerateSchemaParams {
  file?: string;
  tables: Record<string, unknown>;
  getModelName: (model: string) => string;
  getFieldName: (opts: { model: string; field: string }) => string;
  getReferencedModel: (table: string, field: string) => string | null;
}

export function generateSchema(
  params: GenerateSchemaParams,
): DBAdapterSchemaCreation {
  const { file, tables, getModelName, getFieldName, getReferencedModel } =
    params;

  const lines: string[] = [];
  const date = new Date();
  const formatted = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} at ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;

  lines.push(
    "-- ╔════════════════════════════════════════════════════════════════════════╗",
    "-- ║                     SurrealDB Better Auth Schema                       ║",
    "-- ╟────────────────────────────────────────────────────────────────────────╢",
    "-- ║  Auto-generated for Better Auth integration                            ║",
    "-- ║  Adapter: surrealdb-auth-adapter                                       ║",
    "-- ║  Repo: https://github.com/cellograph/surrealdb-auth-adapter            ║",
    `-- ║  Generated: ${formatted.padEnd(58)}║`,
    "-- ╟────────────────────────────────────────────────────────────────────────╢",
    "-- ║  Review this schema before applying it to production.                  ║",
    "-- ╚════════════════════════════════════════════════════════════════════════╝",
    "",
    "",
  );

  function tableBox(text: string): string[] {
    const content = text.padEnd(68, " ");
    return [
      `-- ╔${"═".repeat(72)}╗`,
      `-- ║  ${content}  ║`,
      `-- ╚${"═".repeat(72)}╝`,
    ];
  }

  function mapFieldType(
    tableName: string,
    fieldName: string,
    type?: string,
  ): string {
    try {
      const accountTable = getModelName("account");
      const userTable = getModelName("user");
      const accountIdField = getFieldName({
        model: "account",
        field: "accountId",
      });
      if (tableName === accountTable && fieldName === accountIdField) {
        return `record<${userTable}> | string`;
      }
    } catch {
      /* models not in schema */
    }

    try {
      const oauthTokenTable = getModelName("oauthAccessToken");
      const oauthAppTable = getModelName("oauthApplication");
      const clientIdField = getFieldName({
        model: "oauthAccessToken",
        field: "clientId",
      });
      if (tableName === oauthTokenTable && fieldName === clientIdField) {
        return `record<${oauthAppTable}>`;
      }
    } catch {
      /* models not in schema */
    }

    try {
      const oauthConsentTable = getModelName("oauthConsent");
      const oauthAppTable = getModelName("oauthApplication");
      const clientIdField = getFieldName({
        model: "oauthConsent",
        field: "clientId",
      });
      if (tableName === oauthConsentTable && fieldName === clientIdField) {
        return `record<${oauthAppTable}>`;
      }
    } catch {
      /* models not in schema */
    }

    const ref = getReferencedModel(tableName, fieldName);
    if (ref) return `record<${ref}>`;

    return (
      ({ boolean: "bool", date: "datetime" } as Record<string, string>)[
        type ?? ""
      ] ??
      type ??
      "any"
    );
  }

  const INDEX_FIELDS: Record<string, string | string[]> = {
    user: "email",
    account: "userId",
    session: ["userId", "token"],
    verification: "identifier",
    invitation: ["email", "organizationId"],
    member: ["userId", "organizationId"],
    organization: "slug",
    passkey: "userId",
    twoFactor: "secret",
  };

  for (const [internalModel, tableDef] of Object.entries(tables)) {
    const def = tableDef as Record<string, unknown>;
    if (def.disableMigrations) continue;
    const tableName = getModelName(internalModel);

    lines.push(...tableBox(`TABLE: ${tableName}`));
    lines.push(`DEFINE TABLE OVERWRITE ${tableName} SCHEMAFULL;`, "");

    const fields = def.fields as
      | Record<string, Record<string, unknown>>
      | undefined;
    if (fields) {
      for (const [internalField, field] of Object.entries(fields)) {
        const fieldName = getFieldName({
          model: internalModel,
          field: internalField,
        });
        const base = mapFieldType(tableName, fieldName, field.type?.toString());
        const final = field.required === false ? `option<${base}>` : base;
        lines.push(
          `DEFINE FIELD OVERWRITE ${fieldName} ON TABLE ${tableName} TYPE ${final};`,
        );
      }

      lines.push("");

      const toIndex = INDEX_FIELDS[internalModel];
      for (const [internalField, field] of Object.entries(fields)) {
        const shouldIndex =
          toIndex &&
          (Array.isArray(toIndex)
            ? toIndex.includes(internalField)
            : toIndex === internalField);
        if (shouldIndex) {
          const fieldName = getFieldName({
            model: internalModel,
            field: internalField,
          });
          const unique = field.unique ? " UNIQUE" : "";
          lines.push(
            `DEFINE INDEX OVERWRITE idx_${tableName}_${fieldName} ON ${tableName} COLUMNS ${fieldName}${unique};`,
          );
        }
      }
    }
    lines.push("");
  }

  return {
    path: file ?? "schema.surql",
    code: lines.join("\n"),
    overwrite: true,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
