import type { DBAdapterDebugLogOption } from "better-auth/adapters";

export type RecordIdString = string & { __brand: "RecordId" };

export type IdGenerator =
  | "sdk.UUIDv4"
  | "sdk.UUIDv7"
  | "surreal"
  | "surreal.ULID"
  | "surreal.UUID"
  | "surreal.UUIDv4"
  | "surreal.UUIDv7"
  | "surreal.guid";

export interface SurrealAdapterConfig {
  debugLogs?: DBAdapterDebugLogOption;
  usePlural?: boolean;
  idGenerator?: IdGenerator;
  allowPassingId?: boolean;
  strictOperators?: boolean;
}

export interface RecordIdMap {
  tableSpecific: Record<string, Record<string, string>>;
}

export type AdapterMethod =
  | "create" | "update" | "updateMany"
  | "findOne" | "findMany" | "delete" | "deleteMany" | "count";

export interface FieldMappingRule {
  sourceModel: string;
  sourceField: string;
  targetModel: string;
  condition?: (data: Record<string, unknown>) => boolean;
}

export interface QuerySuffixOptions {
  sortBy?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
  offset?: number;
  groupAll?: boolean;
  returnAfter?: boolean;
  returnFields?: string;
  limitOne?: boolean;
  model?: string;
}

export const COMPARISON_OPERATORS: Record<string, string> = {
  eq: "=", ne: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=",
};

export const STRING_OPERATORS: Record<string, string> = {
  contains: "CONTAINS",
  starts_with: "starts_with",
  ends_with: "ends_with",
};

export const DEFAULT_FIELD_REFERENCES: Record<string, string> = {
  userId: "user",
  organizationId: "organization",
  teamId: "team",
  inviterId: "user",
  activeOrganizationId: "organization",
  activeTeamId: "team",
};

export const FIELD_MAPPING_RULES: FieldMappingRule[] = [
  {
    sourceModel: "account",
    sourceField: "accountId",
    targetModel: "user",
    condition: (data) => data["providerId"] === "credential",
  },
  {
    sourceModel: "oauthAccessToken",
    sourceField: "clientId",
    targetModel: "oauthApplication",
  },
  {
    sourceModel: "oauthConsent",
    sourceField: "clientId",
    targetModel: "oauthApplication",
  },
];
