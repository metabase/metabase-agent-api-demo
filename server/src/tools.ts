import { tool } from "ai";
import { z } from "zod";
import * as metabase from "./metabase.js";

const filterSchema = z.union([
  z.object({
    segment_id: z.number().describe("ID of a pre-defined segment"),
  }),
  z.object({
    field_id: z.string().describe("Field ID from table/metric detail endpoint"),
    operation: z.string().describe("Filter operation (e.g. equals, greater-than, string-contains)"),
    value: z.union([z.string(), z.number()]).optional().describe("Single filter value"),
    values: z.array(z.union([z.string(), z.number()])).optional().describe("Multiple filter values"),
    bucket: z.string().optional().describe("Temporal bucketing granularity for date comparisons"),
  }),
]);

const aggregationSchema = z.union([
  z.object({
    field_id: z.string().optional().describe("Field to aggregate (omit for plain count)"),
    function: z
      .enum(["avg", "count", "count-distinct", "max", "min", "sum"])
      .describe("Aggregation function"),
    sort_order: z.enum(["asc", "desc"]).optional().describe("Sort by this aggregation's result"),
  }),
  z.object({
    measure_id: z.number().describe("ID of a pre-defined measure"),
    sort_order: z.enum(["asc", "desc"]).optional().describe("Sort by this measure's result"),
  }),
]);

const groupBySchema = z.object({
  field_id: z.string().describe("Field ID to group by"),
  field_granularity: z
    .enum(["minute", "hour", "day", "week", "month", "quarter", "year", "day-of-week"])
    .optional()
    .describe("Temporal granularity for date fields"),
});

const orderBySchema = z.object({
  field: z.object({ field_id: z.string() }),
  direction: z.enum(["asc", "desc"]),
});

export const agentTools = {
  search_data_sources: tool({
    description:
      "Search for tables and metrics in Appice. Use keyword queries for exact matches and semantic queries for natural-language searches. Returns a ranked list of matching tables and metrics.",
    inputSchema: z.object({
      term_queries: z
        .array(z.string())
        .optional()
        .describe("Keyword search terms (e.g. ['revenue', 'orders'])"),
      semantic_queries: z
        .array(z.string())
        .optional()
        .describe("Natural-language queries (e.g. ['how much money did we make'])"),
    }),
    execute: async ({ term_queries, semantic_queries }) =>
      metabase.search(term_queries, semantic_queries),
  }),

  get_table_details: tool({
    description:
      "Get details for a table including its fields (with IDs), related tables, and available metrics. You must call this before constructing a table query — field IDs are required.",
    inputSchema: z.object({
      table_id: z.number().describe("Table ID from search results"),
      with_measures: z.boolean().optional().describe("Include reusable measure definitions"),
      with_segments: z.boolean().optional().describe("Include pre-defined segment filters"),
    }),
    execute: async ({ table_id, with_measures, with_segments }) =>
      metabase.getTable(table_id, {
        withFields: true,
        withFieldValues: false, // Exclude field values to avoid context bloat
        withMeasures: with_measures,
        withSegments: with_segments,
      }),
  }),

  get_metric_details: tool({
    description:
      "Get details for a metric including its queryable dimensions. Metrics have a pre-defined aggregation, so you only need to choose filters and group-by dimensions.",
    inputSchema: z.object({
      metric_id: z.number().describe("Metric ID from search results"),
      with_segments: z.boolean().optional().describe("Include applicable segments"),
    }),
    execute: async ({ metric_id, with_segments }) =>
      metabase.getMetric(metric_id, { withSegments: with_segments }),
  }),

  get_field_values: tool({
    description:
      "Get statistics and sample values for a specific field. Useful for discovering valid filter values (e.g. category names) or understanding value distributions before constructing a query.",
    inputSchema: z.object({
      entity_type: z.enum(["table", "metric"]).describe("Whether the field belongs to a table or metric"),
      entity_id: z.number().describe("Table or metric ID"),
      field_id: z.string().describe("Field ID from the detail endpoint"),
      limit: z.number().optional().describe("Max number of sample values to return (default: 30)"),
    }),
    execute: async ({ entity_type, entity_id, field_id, limit }) =>
      metabase.getFieldValues(entity_type, entity_id, field_id, limit ?? 30),
  }),

  run_query: tool({
    description:
      "Build and execute an Appice query in one step. Provide exactly one of table_id or metric_id. Returns column metadata and result rows.",
    inputSchema: z.object({
      table_id: z.number().optional().describe("Table ID (for table queries)"),
      metric_id: z.number().optional().describe("Metric ID (for metric queries)"),
      filters: z.array(filterSchema).optional().describe("Filter conditions"),
      fields: z
        .array(z.object({ field_id: z.string() }))
        .optional()
        .describe("Specific fields to select (table queries only)"),
      aggregations: z
        .array(aggregationSchema)
        .optional()
        .describe("Aggregations to apply (table queries only)"),
      group_by: z.array(groupBySchema).optional().describe("Group-by dimensions"),
      order_by: z.array(orderBySchema).optional().describe("Ordering (table queries only)"),
      limit: z.number().optional().describe("Maximum rows to return (default: 100)"),
    }),
    execute: async (params) => {
      const { query } = await metabase.constructQuery({
        ...params,
        limit: params.limit ?? 100, // Default limit to avoid context bloat
      });
      return metabase.executeQuery(query);
    },
  }),
};
