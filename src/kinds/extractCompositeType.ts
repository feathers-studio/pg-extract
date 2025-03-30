import type { DbAdapter } from "../adapter.ts";

import type InformationSchemaColumn from "../information_schema/InformationSchemaColumn.ts";
import type PgType from "./PgType.ts";
import {
	CanonicalType,
	canonicaliseTypes,
} from "./query-parts/canonicaliseTypes.ts";

/**
 * Attribute of a composite type.
 */
export interface CompositeTypeAttribute {
	/**
	 * Attribute name.
	 */
	name: string;
	/**
	 * Type information.
	 */
	type: CanonicalType;
	/**
	 * Comment on the attribute.
	 */
	comment: string | null;
	/**
	 * Default value of the attribute.
	 */
	defaultValue: any;
	/**
	 * Maximum length of the attribute.
	 */
	maxLength: number | null;
	/**
	 * Whether the attribute is nullable.
	 */
	isNullable: boolean;
	/**
	 * Behavior of the generated attribute. "ALWAYS" if always generated,
	 * "NEVER" if never generated, "BY DEFAULT" if generated when a value
	 * is not provided.
	 */
	generated: "ALWAYS" | "NEVER" | "BY DEFAULT";
	/**
	 * Whether the attribute is updatable.
	 */
	isUpdatable: boolean;
	/**
	 * Whether the attribute is an identity attribute.
	 */
	isIdentity: boolean;
	/**
	 * Ordinal position of the attribute in the composite type. Starts from 1.
	 */
	ordinalPosition: number;

	/**
	 * The Postgres information_schema views do not contain info about materialized views.
	 * This value is the result of a query that matches the one for regular views.
	 * Use with caution, not all fields are guaranteed to be meaningful and/or accurate.
	 */
	fakeInformationSchemaValue: InformationSchemaColumn;
}

/**
 * Composite type in a schema with details.
 */
export interface CompositeTypeDetails extends PgType<"composite"> {
	/**
	 * Canonical representation of the composite type
	 * with full attribute details.
	 */
	canonical: CanonicalType.Composite;
}

const extractCompositeType = async (
	db: DbAdapter,
	composite: PgType<"composite">,
): Promise<CompositeTypeDetails> => {
	// Form the fully qualified type name
	const fullTypeName = `${composite.schemaName}.${composite.name}`;

	// Get canonical type information with all the metadata
	const canonicalTypes = await canonicaliseTypes(db, [fullTypeName]);

	// The result should be a Composite type
	const canonicalType = canonicalTypes[0] as CanonicalType.Composite;

	// Return the composite type with its canonical representation
	return {
		...composite,
		canonical: canonicalType,
	};
};

export default extractCompositeType;
