// @ts-nocheck Come back to this when views are supported again

import { DbAdapter } from "../adapter.ts";

import type { InformationSchemaColumn } from "../information_schema/InformationSchemaColumn.ts";
import type { InformationSchemaView } from "../information_schema/InformationSchemaView.ts";
import type { ColumnReference, Index } from "./extractTable.ts";
import type { ViewReference } from "./parseViewDefinition.ts";
import parseViewDefinition from "./parseViewDefinition.ts";
import type { PgType } from "./PgType.ts";
import commentMapQueryPart from "./query-parts/commentMapQueryPart.ts";

/**
 * Column type in a view.
 */
export type ViewColumnType = {
	/**
	 * Qualified name of the type.
	 */
	fullName: string;
	/**
	 * Kind of the type.
	 */
	kind: "base" | "range" | "domain" | "composite" | "enum";
};

/**
 * Column in a view.
 */
export interface ViewColumn {
	/**
	 * Column name.
	 */
	name: string;
	/**
	 * Expanded type name. If the type is an array, brackets will be appended
	 * to the type name.
	 */
	expandedType: string;
	/**
	 * Type information.
	 */
	type: ViewColumnType;
	/**
	 * Comment on the column.
	 */
	comment: string | null;
	/**
	 * Default value of the column.
	 */
	defaultValue: any;
	/**
	 * Whether the column is an array.
	 */
	isArray: boolean;
	/**
	 * Maximum length of the column.
	 */
	maxLength: number | null;
	/**
	 * Behavior of the generated column. "ALWAYS" if always generated,
	 * "NEVER" if never generated, "BY DEFAULT" if generated when a value
	 * is not provided.
	 */
	generated: "ALWAYS" | "NEVER" | "BY DEFAULT";
	/**
	 * Whether the column is updatable.
	 */
	isUpdatable: boolean;
	/**
	 * Whether the column is an identity column.
	 */
	isIdentity: boolean;
	/**
	 * Ordinal position of the column in the view. Starts from 1.
	 */
	ordinalPosition: number;

	/**
	 * This will contain a "link" to the source table or view and column,
	 * if it can be determined.
	 */
	source: { schema: string; table: string; column: string } | null;

	/**
	 * If views are resolved, this will contain the references from the source
	 * column in the table that this view references. Note that if the source
	 * is another view, that view in turn will be resolved if possible, leading
	 * us to a table in the end.
	 */
	references?: ColumnReference[];
	/** @deprecated use references instead */
	reference?: ColumnReference | null;
	/** @deprecated use TableDetails.indices instead */
	indices?: Index[];
	/**
	 * Whether the column is nullable. This is only present if the view is
	 * resolved.
	 */
	isNullable?: boolean;
	/**
	 * Whether the column is a primary key. This is only present if the view is
	 * resolved.
	 */
	isPrimaryKey?: boolean;

	/**
	 * Information schema value for the column.
	 */
	informationSchemaValue: InformationSchemaColumn;
}

/**
 * View in a schema.
 */
export interface ViewDetails extends PgType<"view"> {
	/**
	 * The SQL definition of the view.
	 */
	definition: string;
	/**
	 * Information schema value for the view.
	 */
	informationSchemaValue: InformationSchemaView;
	/**
	 * Columns in the view.
	 */
	columns: ViewColumn[];
	/**
	 * View options
	 */
	options: {
		/**
		 * Check option mode: 'LOCAL', 'CASCADED', or null if not set
		 */
		checkOption: "local" | "cascaded" | null;
		/**
		 * Whether the view is marked as a security barrier
		 */
		securityBarrier: boolean;
		/**
		 * Whether the view uses invoker rights for permission checks
		 */
		securityInvoker: boolean;
	};
}

// NOTE: This is NOT identical for the one for tables.
// The dimension field is not present for materialized views, so we
// deduce whether or not it is an array by checking the type.
const typeMapQueryPart = `
select
	pg_attribute.attname as "column_name",
	typnamespace::regnamespace::text||'.'||(case when (t.typelem <> 0::oid AND t.typlen = '-1'::integer) then substring(typname, 2)||'[]' else typname end)::text as "expanded_name",
	json_build_object(
		'fullName', typnamespace::regnamespace::text||'.'||substring(typname, (case when (t.typelem <> 0::oid AND t.typlen = '-1'::integer) then 2 else 1 end))::text,
		'kind', case 
			when typtype = 'd' then 'domain'
			when typtype = 'r' then 'range'
			when typtype = 'c' then 'composite'
			when typtype = 'e' then 'enum'
			when typtype = 'b' then COALESCE((select case 
				when i.typtype = 'r' then 'range' 
				when i.typtype = 'd' then 'domain' 
				when i.typtype = 'c' then 'composite' 
				when i.typtype = 'e' then 'enum' 
			end as inner_kind from pg_type i where i.oid = t.typelem), 'base')
		ELSE 'unknown'
		end
	) as "type_info"
from pg_type t
join pg_attribute on pg_attribute.atttypid = t.oid
join pg_class on pg_attribute.attrelid = pg_class.oid
join pg_namespace on pg_class.relnamespace = pg_namespace.oid
WHERE
	pg_namespace.nspname = $2
	and pg_class.relname = $1
`;

const resolveSource = (
	column: ViewColumn,
	sourceMapping?: Record<string, ViewReference>,
): ViewColumn => ({
	...column,
	source: sourceMapping?.[column.name]?.source ?? null,
});

const extractView = async (
	db: DbAdapter,
	view: PgType<"view">,
): Promise<ViewDetails> => {
	const [informationSchemaValue] = await db.query<
		InformationSchemaView,
		[string, string]
	>(
		`
		SELECT * FROM information_schema.views
		WHERE table_name = $1
		AND table_schema = $2;
	`,
		[view.name, view.schemaName],
	);

	const columnsQuery = await db.query<ViewColumn, [string, string]>(
		`
		WITH 
		type_map AS (
			${typeMapQueryPart}
		),
		comment_map AS (
			${commentMapQueryPart}
		)
		SELECT
			columns.column_name AS "name",
			type_map.expanded_name AS "expandedType",
			type_map.type_info AS "type",
			comment_map.comment AS "comment",
			character_maximum_length AS "maxLength", 
			column_default AS "defaultValue", 
			data_type = 'ARRAY' AS "isArray", 
			is_identity = 'YES' AS "isIdentity", 
			is_updatable = 'YES' AS "isUpdatable", 
			ordinal_position AS "ordinalPosition", 
			CASE WHEN is_identity = 'YES' THEN
				identity_generation
			ELSE
				is_generated
			END AS "generated", 
			
			row_to_json(columns.*) AS "informationSchemaValue"
		FROM
			information_schema.columns
			LEFT JOIN type_map ON type_map.column_name = columns.column_name
			LEFT JOIN comment_map ON comment_map.column_name = columns.column_name
		WHERE
			table_name = $1
			AND table_schema = $2;
	`,
		[view.name, view.schemaName],
	);

	const viewOptionsQuery = await db.query<
		{
			check_option: string | null;
			security_barrier: boolean;
			security_invoker: boolean;
		},
		[string, string]
	>(
		`
		SELECT
			CASE 
				WHEN c.relkind = 'v' THEN (
					SELECT option_value
					FROM pg_options_to_table(reloptions)
					WHERE option_name = 'check_option'
				)
			END as check_option,
			COALESCE((
				SELECT option_value::boolean
				FROM pg_options_to_table(reloptions)
				WHERE option_name = 'security_barrier'
			), false) as security_barrier,
			COALESCE((
				SELECT option_value::boolean
				FROM pg_options_to_table(reloptions)
				WHERE option_name = 'security_invoker'
			), false) as security_invoker
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = $1
		AND c.relname = $2
	`,
		[view.schemaName, view.name],
	);

	const unresolvedColumns: ViewColumn[] = columnsQuery;
	let sourceMapping: Record<string, ViewReference> | undefined;
	try {
		const viewReferences = await parseViewDefinition(
			informationSchemaValue!.view_definition,
			view.schemaName,
		);
		sourceMapping = viewReferences.reduce((acc, ref) => {
			acc[ref.viewColumn] = ref;
			return acc;
		}, {} as Record<string, ViewReference>);
	} catch {
		console.warn(
			`Error parsing view definition for "${view.name}". Falling back to raw data`,
		);
	}

	const columns = unresolvedColumns.map(column =>
		resolveSource(column, sourceMapping),
	);

	return {
		...view,
		definition: informationSchemaValue!.view_definition,
		informationSchemaValue: informationSchemaValue!,
		columns,
		options: {
			checkOption: viewOptionsQuery[0]!.check_option as
				| "local"
				| "cascaded"
				| null,
			securityBarrier: viewOptionsQuery[0]!.security_barrier,
			securityInvoker: viewOptionsQuery[0]!.security_invoker,
		},
	};
};

export default extractView;
