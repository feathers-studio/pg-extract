import knex from 'knex';
import { GenericContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest';

import extractSchema from '../extract-schema';

const timeout = 5 * 60 * 1000;
const containerLogPrefix = 'postgres-container>>> ';

describe('extractSchema', () => {
  /** @type {import('testcontainers').StartedTestContainer} */
  let startedContainer;

  let connection;
  let config;

  beforeAll(async () => {
    if (process.arch === 'arm64') {
      // The Ruyk thing doesn't work on arm64 at the time of writing.
      // Disable and prune docker images manually
      // eslint-disable-next-line no-process-env
      process.env['TESTCONTAINERS_RYUK_DISABLED'] = true;
    }
    const genericContainer = new GenericContainer(
      'kristiandupont/dvdrental-image'
    )
      .withExposedPorts(5432)
      .withEnvironment({ POSTGRES_PASSWORD: 'postgres' })
      .withStartupTimeout(timeout);
    // .withWaitStrategy(
    //   Wait.forLogMessage('database system is ready to accept connections')
    // );
    startedContainer = await genericContainer.start();
    const stream = await startedContainer.logs();
    stream
      // .on('data', (line) => console.log(containerLogPrefix + line))
      .on('err', (line) => console.error(containerLogPrefix + line))
      // eslint-disable-next-line no-console
      .on('end', () => console.log(containerLogPrefix + 'Stream closed'));

    connection = {
      host: startedContainer.getHost(),
      database: 'dvdrental',
      port: startedContainer.getMappedPort(5432),
      password: 'postgres',
      user: 'postgres',
    };

    config = {
      client: 'postgres',
      connection,
    };

    const setupDB = knex(config);

    await setupDB.schema.createSchemaIfNotExists('some_schema');
    await setupDB.schema
      .withSchema('some_schema')
      .createTable('default_table', (table) => {
        table.increments();
        table.enu('cust_type', ['value1', 'value2'], {
          useNative: true,
          enumName: 'cust_type',
        });
        table.string('name');
        table.boolean('flag');
        table.timestamps();
        table.jsonb('json_field');
        table.uuid('uuid_col');
      });

    await setupDB.schema.raw(
      'CREATE VIEW some_schema.default_view AS select * from some_schema.default_table'
    );

    // await setupDB.schema.raw(
    //   'CREATE MATERIALIZED VIEW some_schema.default_matview AS select * from some_schema.default_table'
    // );

    await setupDB.schema.createSchemaIfNotExists('not_default');
    await setupDB.schema.raw(
      "CREATE TYPE not_default.cust_type_not_default as ENUM ('custom1', 'custom2');"
    );

    await setupDB.schema
      .withSchema('not_default')
      .createTable('not_default_table', (table) => {
        table.increments();
        table.enu('cust_type_not_default', ['custom1', 'custom2'], {
          useNative: true,
          existingType: true,
          enumName: 'cust_type_not_default',
          schemaName: 'not_default',
        });
        table.string('name_2');
        table.boolean('flag_2');
        table.timestamps();
        table.jsonb('json_2');
        table.uuid('uuid_2');
      });

    await setupDB.schema.raw(
      'CREATE VIEW not_default.not_default_view AS select * from not_default.not_default_table'
    );
    await setupDB.destroy();
  }, timeout);

  afterAll(async () => {
    await startedContainer.stop({
      timeout: 10_000,
    });
  }, timeout);

  test('in first schema', async () => {
    const extracted = await extractSchema('some_schema', connection, false);

    expect(extracted.tables).toHaveLength(1);
    expect(extracted.tables[0].name).toBe('default_table');

    expect(extracted.views).toHaveLength(1);

    const extractedViewNames = extracted.views.map((view) => view.name);
    expect(extractedViewNames).toContain('default_view');

    // This currently doesn't work. Uncomment when fixing materialized views.
    // expect(extractedViewNames).toContain('default_matview');

    // // The materialized view should be equal to the regular view in everything but name
    // expect(extracted.views[0]).toEqual({
    //   ...extracted.views[1],
    //   name: 'default_matview',
    // });

    expect(extracted.types).toHaveLength(1);
    expect(extracted.types.filter((t) => t.name === 'cust_type')).toHaveLength(
      1
    );
    expect(
      extracted.types.filter((t) => t.name === 'cust_type_not_default')
    ).toHaveLength(0);
  });

  test('in secondary schema', async () => {
    const extracted = await extractSchema('not_default', connection, false);

    expect(extracted.tables).toHaveLength(1);
    expect(extracted.tables[0].name).toBe('not_default_table');

    expect(extracted.views).toHaveLength(1);
    expect(extracted.views[0].name).toBe('not_default_view');

    expect(extracted.types).toHaveLength(1);
    expect(extracted.types.filter((t) => t.name === 'cust_type')).toHaveLength(
      0
    );
    expect(
      extracted.types.filter((t) => t.name === 'cust_type_not_default')
    ).toHaveLength(1);
  });

  test('references should contain schema, table and column', async () => {
    const db = knex(config);
    await db.raw(`CREATE SCHEMA test1;
CREATE SCHEMA test2;

CREATE TABLE test1.users (
    id integer PRIMARY KEY
);

CREATE TABLE test2.user_managers (
    id integer PRIMARY KEY,
    user_id integer REFERENCES test1.users(id)
);
`);
    await db.destroy();

    const extracted = await extractSchema('test2', connection, false);

    expect(extracted.tables[0].columns[1].reference).toEqual({
      schema: 'test1',
      table: 'users',
      column: 'id',
      onDelete: 'NO ACTION',
      onUpdate: 'NO ACTION',
    });
  });

  describe('view column resolution', () => {
    it('should resolve foreign keys and other properties in simple views', async () => {
      const db = knex(config);
      await db.raw(`
DROP SCHEMA some_schema CASCADE;
CREATE SCHEMA some_schema;
CREATE TABLE some_schema.secondary (
    id integer PRIMARY KEY
);

CREATE TABLE some_schema.source (
    id integer PRIMARY KEY,
    name text,
    secondary_ref integer REFERENCES some_schema.secondary(id) NOT NULL
);

CREATE VIEW some_schema.v AS SELECT * FROM some_schema.source;
`);
      await db.destroy();

      const extracted = await extractSchema('some_schema', connection, true);

      const v = extracted.views.find((view) => view.name === 'v');

      const id = v.columns.find((column) => column.name === 'id');
      expect(id.isPrimary).toBe(true);
      expect(id.nullable).toBe(false);

      const ref = v.columns.find((column) => column.name === 'secondary_ref');
      expect(ref.nullable).toBe(false);
      expect(ref.reference).toMatchObject({
        column: 'id',
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
        schema: 'some_schema',
        table: 'secondary',
      });
    });
  });

  describe('dvd-rental database', () => {
    it('Should match snapshot', async () => {
      const extracted = await extractSchema('public', connection, true);
      expect(extracted).toMatchSnapshot();
    });
  });

  describe('Partitions', () => {
    it('Should create only one object per table even if there are partitions', async () => {
      const db = knex(config);
      await db.raw(`CREATE SCHEMA partition_test
   CREATE TABLE test (
     id SERIAL,
     type TEXT NOT NULL,
     PRIMARY KEY(id, type)
   ) PARTITION BY LIST(type)

   CREATE TABLE test_a PARTITION OF test FOR VALUES IN ('a')
 ;`);
      await db.destroy();
      const extracted = await extractSchema(
        'partition_test',
        connection,
        false
      );

      expect(extracted.tables).toHaveLength(1);
    });
  });

  // Confirms the use of distinct in extractTables()
  describe('Triggers', () => {
    it('Should create only one object per table even if there are triggers', async () => {
      const db = knex(config);
      await db.raw(`CREATE SCHEMA trigger_test
   CREATE TABLE test (id int);

   CREATE FUNCTION test_function() RETURNS TRIGGER LANGUAGE plpgsql
     AS $$ begin
      return null;
     end; $$;

   CREATE TRIGGER test_trigger AFTER INSERT OR UPDATE
     ON trigger_test.test
     FOR EACH ROW execute function test_function()
 ;`);
      await db.destroy();
      const extracted = await extractSchema('trigger_test', connection, false);
      expect(extracted.tables).toHaveLength(1);
    });
  });

  describe('selected tables', () => {
    beforeAll(async () => {
      const db = knex(config);
      await db.raw(`CREATE SCHEMA test3;

CREATE TABLE test3.users (
    id integer PRIMARY KEY
);

CREATE TABLE test3.credentials (
    id integer PRIMARY KEY,
    user_id integer REFERENCES test3.users(id),
    password text
);
`);
      await db.destroy();
    });

    it('by default get all tables', async () => {
      const all = await extractSchema('test3', connection, false);
      expect(all.tables).toHaveLength(2);
      const tableNames = all.tables.map((t) => t.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('credentials');
    });

    it('should get only selected tables', async () => {
      const selected = await extractSchema('test3', connection, false, [
        'users',
      ]);
      expect(selected.tables).toHaveLength(1);
      expect(selected.tables[0].name).toBe('users');
    });
  });
});
