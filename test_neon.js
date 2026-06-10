import { neon } from '@neondatabase/serverless';

const connectionString = "postgresql://neondb_owner:npg_UHpmhfV89sYd@ep-purple-lab-aol9tfl4.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const sql = neon(connectionString);

async function test() {
  try {
    console.log("Testing connection via HTTP fetch...");
    const result = await sql`SELECT 1 as val`;
    console.log("Success! Result:", result);
  } catch (err) {
    console.error("HTTP connection failed:", err);
  }
}
test();
