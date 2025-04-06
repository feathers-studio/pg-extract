let pgQueryInstance: any;
const getPgQuery = async () => {
	if (!pgQueryInstance) {
		const { default: pgQueryModule } = await import(
			"pg-query-emscripten/pg_query_wasm"
		);
		pgQueryInstance = await new pgQueryModule();
	}
	return pgQueryInstance;
};

export type ViewReference = {
	viewColumn: string;
	source:
		| {
				schema: string;
				table: string;
				column: string;
		  }
		| undefined;
};

function parseSelectStmt(
	selectAst: any, // Change the type to match the AST structure
	defaultSchema: string,
	aliases: { [alias: string]: { schema: string; table: string } },
): ViewReference[] {
	if (selectAst.larg && selectAst.rarg) {
		// This is a UNION, INTERSECT, or EXCEPT operation
		return [
			...parseSelectStmt(selectAst.larg, defaultSchema, aliases),
			...parseSelectStmt(selectAst.rarg, defaultSchema, aliases),
		];
	}

	const viewReferences: ViewReference[] = [];

	selectAst.fromClause.forEach((fromClause: any) => {
		const fromTable = fromClause.RangeVar;

		// @ts-expect-error selectAst is not typed, this might be wrong
		// "$.targetList[*].ResTarget"
		const selectTargets = selectAst.targetList.map(target => target.ResTarget);

		selectTargets.forEach((selectTarget: any) => {
			// @ts-expect-error selectTarget is not typed, this might be wrong
			// "$.val[*].fields[*].String.sval"
			// prettier-ignore
			const fields = selectTarget.val.map(v => v.fields.map(f => f.String.sval));
			let sourceTable = fromTable?.relname;
			let sourceSchema = fromTable?.schemaname;
			if (fields.length === 2) {
				const tableRel = fields[0];
				if (tableRel in aliases) {
					sourceTable = aliases[tableRel]!.table;
					sourceSchema = aliases[tableRel]!.schema ?? sourceSchema;
				} else {
					sourceTable = tableRel;
				}
			}
			const sourceColumn = fields.at(-1);

			const viewReference: ViewReference = {
				viewColumn: selectTarget.name || fields.at(-1),
				source:
					sourceTable && sourceColumn
						? {
								schema: sourceSchema ?? defaultSchema,
								table: sourceTable,
								column: fields.at(-1),
						  }
						: undefined,
			};
			viewReferences.push(viewReference);
		});
	});

	return viewReferences;
}
async function parseViewDefinition(
	selectStatement: string,
	defaultSchema: string,
): Promise<ViewReference[]> {
	const pgQuery = await getPgQuery();
	const ast = pgQuery.parse(selectStatement).parse_tree.stmts[0];
	const selectAst = ast?.stmt?.SelectStmt;

	if (!selectAst) {
		throw new Error(
			`The string '${selectStatement}' doesn't parse as a select statement.`,
		);
	}

	// Extract alias definitions from the AST
	// "$.targetList[*].ResTarget" might be a wrong translation of JP:
	const aliasDefinitions = ast.stmt.SelectStmt.fromClause
		.filter((fromClause: any) => fromClause.RangeVar?.alias)
		.map((fromClause: any) => ({
			schemaname: fromClause.RangeVar.schemaname,
			relname: fromClause.RangeVar.relname,
			alias: fromClause.RangeVar.alias,
		}));

	const aliases = Object.fromEntries(
		// @ts-expect-error aliasDefinitions is not typed, this might be wrong
		aliasDefinitions.map(({ schemaname, relname, alias }) => [
			alias.aliasname,
			{ schema: schemaname, table: relname },
		]),
	);

	const withClauses = selectAst.withClause?.ctes || [];

	const cteAliases: Record<string, ViewReference[]> = {};

	for (const cte of withClauses) {
		if (cte.CommonTableExpr) {
			const alias = cte.CommonTableExpr.ctename;
			const cteQuery = cte.CommonTableExpr.ctequery.SelectStmt;

			if (!cteQuery) {
				continue;
			}

			// Process the CTE query recursively
			const cteAlias = parseSelectStmt(cteQuery, defaultSchema, aliases);

			cteAliases[alias] = cteAlias;
		}
	}

	const primaryViewReferences = parseSelectStmt(
		selectAst,
		defaultSchema,
		aliases,
	);

	const viewReferences = primaryViewReferences.map(viewReference => {
		const source = viewReference.source;
		return source && source.table in cteAliases
			? (cteAliases[source.table]!.find(
					cteViewReference =>
						cteViewReference.viewColumn === viewReference.viewColumn,
			  ) as ViewReference)
			: viewReference;
	});

	return viewReferences;
}

export default parseViewDefinition;
