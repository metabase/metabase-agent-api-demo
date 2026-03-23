import jwt from "jsonwebtoken";

const METABASE_URL = () => process.env.METABASE_INSTANCE_URL!.trim();
/** Trimmed — trailing newlines/spaces in .env break HMAC vs the instance JWT validator. */
const JWT_SECRET = () => process.env.METABASE_JWT_SHARED_SECRET!.trim();
const USER_EMAIL = () => process.env.METABASE_USER_EMAIL!.trim();

/** Same claims as Agent API JWT; also used for modular embedding (`fetchRequestToken`). */
export function signJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      email: USER_EMAIL(),
      iat: now,
      // Some JWT validators expect exp; keep total lifetime under Agent API iat window (~180s).
      exp: now + 120,
    },
    JWT_SECRET(),
  );
}

async function agentRequest(path: string, options?: RequestInit) {
  const token = signJwt();
  const url = `${METABASE_URL()}/api/agent${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const body = await response.text();

  if (!response.ok) {
    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string };
      if (parsed.message) {
        detail = parsed.message;
        if (parsed.error === "jwt_not_configured") {
          detail +=
            " Enable JWT in admin: Admin → Settings → Authentication → JWT, set the shared secret to match METABASE_JWT_SHARED_SECRET in .env, and save.";
        }
      }
    } catch {
      /* use raw body */
    }
    throw new Error(`Appice API ${response.status}: ${detail}`);
  }

  return JSON.parse(body);
}

export async function search(
  termQueries?: string[],
  semanticQueries?: string[],
) {
  return agentRequest("/v1/search", {
    method: "POST",
    body: JSON.stringify({
      term_queries: termQueries,
      semantic_queries: semanticQueries,
    }),
  });
}

export async function getTable(
  id: number,
  options?: {
    withFields?: boolean;
    withFieldValues?: boolean;
    withRelatedTables?: boolean;
    withMetrics?: boolean;
    withMeasures?: boolean;
    withSegments?: boolean;
  },
) {
  const params = new URLSearchParams();
  if (options?.withFields !== undefined)
    params.set("with-fields", String(options.withFields));
  if (options?.withFieldValues !== undefined)
    params.set("with-field-values", String(options.withFieldValues));
  if (options?.withRelatedTables !== undefined)
    params.set("with-related-tables", String(options.withRelatedTables));
  if (options?.withMetrics !== undefined)
    params.set("with-metrics", String(options.withMetrics));
  if (options?.withMeasures !== undefined)
    params.set("with-measures", String(options.withMeasures));
  if (options?.withSegments !== undefined)
    params.set("with-segments", String(options.withSegments));
  const qs = params.toString();
  return agentRequest(`/v1/table/${id}${qs ? `?${qs}` : ""}`);
}

export async function getMetric(
  id: number,
  options?: {
    withDefaultTemporalBreakout?: boolean;
    withFieldValues?: boolean;
    withQueryableDimensions?: boolean;
    withSegments?: boolean;
  },
) {
  const params = new URLSearchParams();
  if (options?.withDefaultTemporalBreakout !== undefined)
    params.set(
      "with-default-temporal-breakout",
      String(options.withDefaultTemporalBreakout),
    );
  if (options?.withFieldValues !== undefined)
    params.set("with-field-values", String(options.withFieldValues));
  if (options?.withQueryableDimensions !== undefined)
    params.set(
      "with-queryable-dimensions",
      String(options.withQueryableDimensions),
    );
  if (options?.withSegments !== undefined)
    params.set("with-segments", String(options.withSegments));
  const qs = params.toString();
  return agentRequest(`/v1/metric/${id}${qs ? `?${qs}` : ""}`);
}

export async function getFieldValues(
  entityType: "table" | "metric",
  entityId: number,
  fieldId: string,
  limit?: number,
) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set("limit", String(limit));
  const qs = params.toString();
  return agentRequest(
    `/v1/${entityType}/${entityId}/field/${fieldId}/values${qs ? `?${qs}` : ""}`,
  );
}

export async function constructQuery(query: Record<string, unknown>) {
  return agentRequest("/v1/construct-query", {
    method: "POST",
    body: JSON.stringify(query),
  });
}

export async function executeQuery(encodedQuery: string) {
  const result = await agentRequest("/v1/execute", {
    method: "POST",
    body: JSON.stringify({ query: encodedQuery }),
  });

  // /v1/execute always returns 202; check the body for actual status
  return {
    status: result.status,
    error: result.error,
    columns: result.data?.cols?.map(
      (c: { display_name: string; name: string; base_type: string }) => ({
        display_name: c.display_name,
        name: c.name,
        base_type: c.base_type,
      }),
    ),
    rows: result.data?.rows,
    row_count: result.row_count,
    running_time: result.running_time,
  };
}
