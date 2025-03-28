import { afterAll, beforeAll } from "vitest";

import knex, { type Knex } from "knex";
import { PGlite } from "@electric-sql/pglite";
import ClientPGLite from "knex-pglite";

import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { citext } from "@electric-sql/pglite/contrib/citext";

const useTestKnex = (): readonly [() => Knex<any, any[]>, string] => {
  let knexInstance: Knex;

  const database = `test_${Math.ceil(Math.random() * 1000)}`;
  const pglite = new PGlite("memory://", {
    database,
    extensions: { pg_trgm, citext },
  });

  const config = {
    client: ClientPGLite,
    dialect: "postgres",
    connection: { pglite } as any,
  };

  const dbConfig = {
    ...config,
    connection: { ...config.connection, database },
  };

  beforeAll(async () => {
    knexInstance = knex(dbConfig);
    console.log("created database", database);
  });

  afterAll(async () => {
    const setupKnexInstance = knex(dbConfig);

    setupKnexInstance
      .raw(`drop database ${database} with (force)`)
      .then(() => setupKnexInstance.destroy());

    await knexInstance.destroy();
    console.log("dropped database", database);
  });

  return [() => knexInstance, database] as const;
};

export default useTestKnex;
