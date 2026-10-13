import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const session = JSON.parse(fs.readFileSync("scratch/user_session.json", "utf-8"));
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

async function run() {
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
  if (error) {
    console.error("Refresh error:", error.message);
  } else {
    console.log("Successfully refreshed session! New expiry:", new Date(data.session.expires_at * 1000).toISOString());
    fs.writeFileSync("scratch/user_session.json", JSON.stringify(data.session, null, 2));
  }
}

run().catch(console.error);
