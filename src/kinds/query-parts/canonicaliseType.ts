import { type Knex } from "knex";

export const canonicaliseTypes = async (db: Knex, types: string[]) => {
  const placeholders = types.map(() => "(?)").join(", ");

  const resolved = await db.raw(
    `
      WITH RECURSIVE 
      -- Parameters (change this value to the type you want to canonicalize)
      input(type_name) AS (
          VALUES (${placeholders})
      ),
      -- Parse array dimensions and base type
      type_parts AS (
          SELECT
              type_name,
              CASE 
                  WHEN type_name ~ '\(.*\)' THEN regexp_replace(type_name, '\(.*\)', '')
                  ELSE type_name
              END AS clean_type,
              CASE 
                  WHEN type_name ~ '\(.*\)' THEN substring(type_name from '\((.*)\)')
                  ELSE NULL
              END AS modifiers
          FROM input
      ),
      array_dimensions AS (
          SELECT
              type_name,
              modifiers,
              CASE 
                  WHEN clean_type ~ '.*\[\].*' THEN 
                      (length(clean_type) - length(regexp_replace(clean_type, '\[\]', '', 'g'))) / 2
                  ELSE 0
              END AS dimensions,
              regexp_replace(clean_type, '\[\]', '', 'g') AS base_type_name
          FROM type_parts
      ),
      -- Get base type information
      base_type_info AS (
          SELECT
              a.type_name,
              a.modifiers,
              a.dimensions,
              t.oid AS type_oid,
              t.typname AS internal_name,
              n.nspname AS schema_name,
              t.typtype AS type_kind_code,
              t.typbasetype,
              CASE t.typtype
                  WHEN 'b' THEN 'base'
                  WHEN 'c' THEN 'composite'
                  WHEN 'd' THEN 'domain'
                  WHEN 'e' THEN 'enum'
                  WHEN 'p' THEN 'pseudo'
                  WHEN 'r' THEN 'range'
                  ELSE 'unknown'
              END AS type_kind
          FROM array_dimensions a
          JOIN pg_type t ON t.oid = a.base_type_name::regtype
          JOIN pg_namespace n ON t.typnamespace = n.oid
      ),
      -- Handle enum values for enum types
      enum_values AS (
          SELECT
              b.type_name,
              jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
          FROM base_type_info b
          JOIN pg_enum e ON b.type_oid = e.enumtypid
          WHERE b.type_kind_code = 'e'
          GROUP BY b.type_name
      ),
      -- Handle attributes for composite types
      composite_attributes AS (
          SELECT
              b.type_name,
              jsonb_agg(
                  jsonb_build_object(
                      'name', a.attname,
                      'number', a.attnum,
                      'type_oid', a.atttypid
                  )
                  ORDER BY a.attnum
              ) AS attributes
          FROM base_type_info b
          JOIN pg_attribute a ON b.type_oid = a.attrelid
          WHERE b.type_kind_code = 'c' AND a.attnum > 0 AND NOT a.attisdropped
          GROUP BY b.type_name
      ),
      -- Recursive CTE to resolve domain base types
      domain_types AS (
          -- Base case: start with initial domain type
          SELECT
              b.type_name AS original_type,
              b.type_oid AS domain_oid,
              b.typbasetype AS base_type_oid,
              1 AS level
          FROM base_type_info b
          WHERE b.type_kind_code = 'd'
          
          UNION ALL
          
          -- Recursive case: follow chain of domains
          SELECT
              d.original_type,
              t.oid AS domain_oid,
              t.typbasetype AS base_type_oid,
              d.level + 1 AS level
          FROM domain_types d
          JOIN pg_type t ON d.base_type_oid = t.oid
          WHERE t.typtype = 'd'  -- Only continue if the base is also a domain
      ),
      -- Get ultimate base type for domains
      domain_base_types AS (
          SELECT DISTINCT ON (original_type)
              d.original_type,
              t.oid AS final_base_oid,
              n.nspname AS base_schema,
              t.typname AS base_name,
              format('%s.%s', n.nspname, t.typname) AS base_canonical_name
          FROM (
              -- Get the max level for each original type
              SELECT original_type, MAX(level) AS max_level
              FROM domain_types
              GROUP BY original_type
          ) m
          JOIN domain_types d ON d.original_type = m.original_type AND d.level = m.max_level
          JOIN pg_type t ON d.base_type_oid = t.oid
          JOIN pg_namespace n ON t.typnamespace = n.oid
      ),
      -- Range type subtype information
      range_subtypes AS (
          SELECT
              b.type_name,
              r.rngsubtype AS subtype_oid,
              format_type(r.rngsubtype, NULL) AS subtype_name
          FROM base_type_info b
          JOIN pg_range r ON b.type_oid = r.rngtypid
          WHERE b.type_kind_code = 'r'
      )
      -- Final result as JSON
      SELECT jsonb_build_object(
          'canonical_name', b.schema_name || '.' || b.internal_name,
          'schema', b.schema_name,
          'name', b.internal_name,
          'type_kind', b.type_kind,
          'dimensions', b.dimensions,
          'original_type', b.type_name,
          'modifiers', b.modifiers,
          'enum_values', e.values,
          'attributes', c.attributes,
          'domain_base_type', CASE 
              WHEN b.type_kind_code = 'd' THEN
                  jsonb_build_object(
                      'canonical_name', d.base_canonical_name,
                      'schema', d.base_schema,
                      'name', d.base_name
                  )
              ELSE NULL
          END,
          'range_subtype', CASE
              WHEN b.type_kind_code = 'r' THEN r.subtype_name
              ELSE NULL
          END
      ) AS type_info
      FROM base_type_info b
      LEFT JOIN enum_values e ON b.type_name = e.type_name
      LEFT JOIN composite_attributes c ON b.type_name = c.type_name
      LEFT JOIN domain_base_types d ON b.type_name = d.original_type
      LEFT JOIN range_subtypes r ON b.type_name = r.type_name;
    `,
    types,
  );

  return resolved as {
    canonical_name: string;
    schema: string;
    name: string;
    type_kind:
      | "base"
      | "composite"
      | "domain"
      | "enum"
      | "range"
      | "pseudo"
      | "unknown";
    dimensions: number;
    original_type: string;
    modifiers: string;
    enum_values: string[];
    attributes: {
      name: string;
      number: number;
      type_oid: number;
    }[];
    domain_base_type: {
      canonical_name: string;
      schema: string;
      name: string;
    } | null;
    range_subtype: string | null;
  }[];
};
