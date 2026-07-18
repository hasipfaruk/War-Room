type Client = { query(sql: string): Promise<void>; release(): void };
const maxConnections = 4;
let checkedOut = 0;

export async function acquireClient(): Promise<Client> {
  if (checkedOut >= maxConnections) throw new Error("database pool exhausted: no client available");
  checkedOut += 1;
  let released = false;
  return {
    async query(_sql: string) { await new Promise((resolve) => setTimeout(resolve, 2)); },
    release() { if (!released) { released = true; checkedOut -= 1; } }
  };
}

export async function withDatabaseClient<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await acquireClient();
  try { return await work(client); } finally { client.release(); }
}

export function poolStats() { return { checkedOut, maxConnections }; }
