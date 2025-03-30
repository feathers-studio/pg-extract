import { Client as Pg } from "pg";
import { PGlite as Pglite } from "@electric-sql/pglite";

class DbAdapter {
	constructor(private client: Pg | Pglite) {}

	connect() {
		if (this.client instanceof Pg) {
			return this.client.connect();
		} else if (this.client instanceof Pglite) {
			// The Pglite client doesn't have a connect method
		}
	}

	/**
	 * Execute a read query and return just the rows
	 */
	async query<R, I extends any[] = []>(text: string, params?: I) {
		// @ts-expect-error The two clients can process our query types similarly
		const result = await this.client.query(text, params);
		return result.rows as R[];
	}

	/**
	 * Close the connection if needed
	 */
	async close() {
		if (this.client instanceof Pg) {
			await this.client.end();
		} else if (this.client instanceof Pglite) {
			// Because it can't be opened, let's leave it open
			// await this.client.close();
		}
	}
}

export { DbAdapter };
