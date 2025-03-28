# Extract Schema from Postgres Database

Reads various metadata from your postgres database and return a Javascript object.
This package was originally forked from [extract-pg-schema](https://github.com/kristiandupont/extract-pg-schema) by [Kristian Dupont](https://github.com/kristiandupont) to extend its utility and to generate perfect types. It's now a standalone package.

> Note: This package is a work in progress and may have missing features or broken modules.
> However, it's already being used to generate types by [TruePG](https://github.com/feathers-studio/true-pg).
> You should probably use that instead.

## Installation

Choose your package manager:

```bash
bun add pg-extract
```

```bash
npm i pg-extract
```

```bash
pnpm add pg-extract
```

## Library Usage

You give it a [postgres connection config object](https://node-postgres.com/apis/client) and some options and it will connect to your database and generate an object with the schema.

```javascript
import { Extractor } from "pg-extract";

const extractor = new Extractor({
  host: "localhost",
  database: "postgres",
  user: "postgres",
  password: "postgres",
});

const result = await extractor.extractSchemas();

console.log(result);
```

For an example of a generated object, take a look at [dvdrental.json](./dvdrental.json) file which is generated from the [sample Database](https://www.postgresqltutorial.com/postgresql-sample-database/) from [PostgreSQLTutorial.com](https://www.postgresqltutorial.com).

## CLI Usage

You can also use the CLI to extract the schemas from a database and write it to the console or a file in JSON format.

```bash
# Or bunx / pnpm dlx
npx pg-extract -h localhost -p 5432 -U postgres -d postgres > schemas.json
```

```
Usage: pg-extract [options] [DBNAME]

Extract all schemas from a PostgreSQL database and print them as JSON.

Options:
    --help                      show this help
    -h, --host=HOSTNAME         database server host or socket directory
    -p, --port=PORT             database server port
    -U, --username=USERNAME     database user name
    -d, --dbname=DBNAME         database name to connect to
    -n, --schema=SCHEMA         include schema regular expression (may be given multiple times)
    -N, --exclude-schema=SCHEMA exclude schema regular expression (may be given multiple times)
```

---

## Contributors

We're grateful to [Kristian Dupont](https://github.com/kristiandupont) and the other contributors to the [extract-pg-schema](https://github.com/kristiandupont/extract-pg-schema) project for the package we are building on top of.
