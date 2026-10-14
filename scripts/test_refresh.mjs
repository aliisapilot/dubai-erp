import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const supabase = createClient(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

async function test() {
  const res = await supabase.auth.refreshSession({ refresh_token: "mfue3doe2c2o" });
  if (res.error) {
    console.log("Refresh error:", res.error.message);
  } else if (res.data?.session) {
    console.log("Success! New token expires at:", new Date(res.data.session.expires_at * 1000).toISOString());
    if (!fs.existsSync("scratch")) fs.mkdirSync("scratch");
    fs.writeFileSync("scratch/user_session.json", JSON.stringify(res.data.session, null, 2));
  }
}

test().catch(console.error);
