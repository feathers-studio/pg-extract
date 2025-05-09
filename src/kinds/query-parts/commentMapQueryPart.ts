// Extract comments from attributes. Used for tables, views, materialized views and composite types.

const commentMapQueryPart = `
	SELECT
		a.attname as "column_name",
		col_description(c.oid, a.attnum::int) as "comment"
	FROM
		pg_class c
		JOIN pg_attribute a on a.attrelid=c.oid
		JOIN pg_namespace n ON c.relnamespace = n.oid
	WHERE
		n.nspname = $2
		AND c.relname = $1
`;

export default commentMapQueryPart;
