import { Client as Pg, ConnectionConfig } from "pg";
import { PGlite as Pglite } from "@electric-sql/pglite";
import { DbAdapter } from "./adapter.ts";

import type { CompositeTypeDetails } from "./kinds/extractCompositeType.ts";
import extractCompositeType from "./kinds/extractCompositeType.ts";
import type { DomainDetails } from "./kinds/extractDomain.ts";
import extractDomain from "./kinds/extractDomain.ts";
import type { EnumDetails } from "./kinds/extractEnum.ts";
import extractEnum from "./kinds/extractEnum.ts";
import type { ForeignTableDetails } from "./kinds/extractForeignTable.ts";
import extractForeignTable from "./kinds/extractForeignTable.ts";
import type { FunctionDetails } from "./kinds/extractFunction.ts";
import extractFunction from "./kinds/extractFunction.ts";
import type { MaterializedViewDetails } from "./kinds/extractMaterializedView.ts";
import extractMaterializedView from "./kinds/extractMaterializedView.ts";
import type { ProcedureDetails } from "./kinds/extractProcedure.ts";
import extractProcedure from "./kinds/extractProcedure.ts";
import type { RangeDetails } from "./kinds/extractRange.ts";
import extractRange from "./kinds/extractRange.ts";
import type { TableDetails } from "./kinds/extractTable.ts";
import extractTable from "./kinds/extractTable.ts";
import type { ViewDetails } from "./kinds/extractView.ts";
import extractView from "./kinds/extractView.ts";
import fetchTypes from "./kinds/fetchTypes.ts";
import type { Kind } from "./kinds/PgType.ts";
import type PgType from "./kinds/PgType.ts";
import resolveViewColumns from "./resolveViewColumns.ts";
import {
	canonicaliseTypes,
	CanonicalType,
} from "./kinds/query-parts/canonicaliseTypes.ts";

interface DetailsMap {
	domain: DomainDetails;
	enum: EnumDetails;
	range: RangeDetails;
	table: TableDetails;
	foreignTable: ForeignTableDetails;
	materializedView: MaterializedViewDetails;
	view: ViewDetails;
	composite: CompositeTypeDetails;
	function: FunctionDetails;
	procedure: ProcedureDetails;
}

/**
 * extractSchemas generates a record of all the schemas extracted, indexed by schema name.
 * The schemas are instances of this type.
 */
export type Schema = {
	name: string;
	domains: DomainDetails[];
	enums: EnumDetails[];
	ranges: RangeDetails[];
	tables: TableDetails[];
	foreignTables: ForeignTableDetails[];
	views: ViewDetails[];
	materializedViews: MaterializedViewDetails[];
	composites: CompositeTypeDetails[];
	functions: FunctionDetails[];
	procedures: ProcedureDetails[];
};

export type SchemaType =
	| DomainDetails
	| EnumDetails
	| RangeDetails
	| TableDetails
	| ForeignTableDetails
	| ViewDetails
	| MaterializedViewDetails
	| CompositeTypeDetails
	| FunctionDetails
	| ProcedureDetails;

const emptySchema: Omit<Schema, "name"> = {
	domains: [],
	enums: [],
	ranges: [],
	tables: [],
	foreignTables: [],
	views: [],
	materializedViews: [],
	composites: [],
	functions: [],
	procedures: [],
};

type Populator<K extends Kind> = (
	pg: DbAdapter,
	pgType: PgType<K>,
) => Promise<DetailsMap[K] | DetailsMap[K][]>;

const populatorMap: { [K in Kind]: Populator<K> } = {
	domain: extractDomain,
	enum: extractEnum,
	range: extractRange,
	table: extractTable,
	foreignTable: extractForeignTable,
	view: extractView,
	materializedView: extractMaterializedView,
	composite: extractCompositeType,
	function: extractFunction,
	procedure: extractProcedure,
};

/**
 * This is the options object that can be passed to `extractSchemas`.
 * @see extractSchemas
 */
export interface ExtractSchemaOptions {
	/**
	 * Will contain an array of schema names to extract.
	 * If undefined, all non-system schemas will be extracted.
	 */
	schemas?: string[];

	/**
	 * Filter function that you can use if you want to exclude
	 * certain items from the schemas.
	 */
	typeFilter?: (pgType: PgType) => boolean;

	/**
	 * extractShemas will always attempt to parse view definitions to
	 * discover the "source" of each column, i.e. the table or view that it
	 * is derived from.
	 * If this option is set to `true`, it will attempt to follow this
	 * source and copy values like indices, isNullable, etc.
	 * so that the view data is closer to what the database reflects.
	 */
	resolveViews?: boolean;

	/**
	 * Called with the number of types to extract.
	 */
	onProgressStart?: (total: number) => void;

	/**
	 * Called once for each type that is extracted.
	 */
	onProgress?: () => void;

	/**
	 * Called when all types have been extracted.
	 */
	onProgressEnd?: () => void;
}

export class Extractor {
	private db: DbAdapter;

	/**
	 * @param connectionConfig - Connection string or configuration object for Postgres connection
	 */
	constructor(opts: {
		pg?: Pg | Pglite;
		uri?: string;
		config?: ConnectionConfig;
	}) {
		let pg;
		if (opts.pg) pg = opts.pg;
		else if (opts.uri) pg = new Pg({ connectionString: opts.uri });
		else if (opts.config) pg = new Pg(opts.config);
		else {
			console.error(
				"One of these options are required in your config file: pg, uri, config. See documentation for more information.",
			);
			process.exit(1);
		}

		this.db = new DbAdapter(pg);
	}

	async canonicaliseTypes(types: string[]) {
		return canonicaliseTypes(this.pg, types);
	}

	async getBuiltinTypes(): Promise<
		{
			name: string;
			format: string;
			kind: string;
		}[]
	> {
		await this.db.connect();
		const db = this.db;

		const query = `
      SELECT t.typname AS name,
            pg_catalog.format_type(t.oid, NULL) AS format,
            CASE t.typtype
                WHEN 'b' THEN 'base'
                WHEN 'c' THEN 'composite'
                WHEN 'd' THEN 'domain'
                WHEN 'e' THEN 'enum'
                WHEN 'p' THEN 'pseudo'
                WHEN 'r' THEN 'range'
                ELSE 'unknown'
            END AS kind
      FROM pg_catalog.pg_type t
      WHERE t.typnamespace = 
            (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = 'pg_catalog')
      ORDER BY name;
    `;

		const result = await db.query<{
			name: string;
			format: string;
			kind: CanonicalType.TypeKind;
		}>(query);

		await db.close();

		return result;
	}

	/**
	 * Perform the extraction
	 * @param options - Optional options
	 * @returns A record of all the schemas extracted, indexed by schema name.
	 */
	async extractSchemas(
		options?: ExtractSchemaOptions,
	): Promise<Record<string, Schema>> {
		await this.db.connect();
		const db = this.db;

		const q = await db.query<{ nspname: string }>(`
      SELECT nspname FROM pg_catalog.pg_namespace
      WHERE nspname != 'information_schema'
      AND nspname NOT LIKE 'pg_%'
    `);

		const allSchemaNames = q.map(r => r.nspname);

		const schemaNames = options?.schemas ?? allSchemaNames;
		if (options?.schemas) {
			const missingSchemas = schemaNames.filter(
				schemaName => !allSchemaNames.includes(schemaName),
			);

			if (missingSchemas.length > 0) {
				throw new Error(`No schemas found for ${missingSchemas.join(", ")}`);
			}
		}

		const pgTypes = await fetchTypes(db, schemaNames);

		const typesToExtract = options?.typeFilter
			? pgTypes.filter(element => options.typeFilter!(element))
			: pgTypes;

		options?.onProgressStart?.(typesToExtract.length);

		const populated = (
			await Promise.all(
				typesToExtract.map(async pgType => {
					const result = await (
						populatorMap[pgType.kind] as Populator<typeof pgType.kind>
					)(pg, pgType);
					options?.onProgress?.();
					return result;
				}),
			)
		).flat();

		const schemas: Record<string, Schema> = {};
		for (const p of populated) {
			if (!(p.schemaName in schemas)) {
				schemas[p.schemaName] = {
					name: p.schemaName,
					...emptySchema,
				};
			}
			(schemas[p.schemaName][`${p.kind}s`] as DetailsMap[typeof p.kind][]) = [
				...schemas[p.schemaName][`${p.kind}s`],
				p,
			];
		}

		const result = options?.resolveViews
			? resolveViewColumns(schemas)
			: schemas;

		options?.onProgressEnd?.();

		await db.close();
		return result;
	}
}
