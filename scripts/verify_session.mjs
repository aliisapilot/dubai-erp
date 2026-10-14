import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const auth = JSON.parse(fs.readFileSync("scripts/extracted_auth.json", "utf8"));
const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const supabase = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] || env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
);

async function test() {
  const { data, error } = await supabase.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  });
  if (error) {
    console.log("setSession error:", error.message);
  } else {
    console.log("Session valid! User:", data.user?.email);
    console.log("New access token expires at:", new Date(data.session.expires_at * 1000).toISOString());
    fs.writeFileSync("scripts/extracted_auth.json", JSON.stringify(data.session, null, 2));

    const { data: companies, error: cErr } = await supabase.from("companies").select("*");
    console.log("Companies:", companies ? companies.map((c) => ({ id: c.id, name: c.name })) : [], cErr?.message || "none");
    if (companies && companies.length > 0) {
      const company = companies[0];
      const { data: tpls, error: tErr } = await supabase
        .from("document_templates")
        .select("id, template_name, document_type, is_default, layout_json")
        .eq("company_id", company.id);

      console.log(`Templates for ${company.name}: ${tpls ? tpls.length : 0} (err: ${tErr?.message || "none"})`);
      const { data: des } = await supabase
        .from("document_design_selections")
        .select("*")
        .eq("company_id", company.id);
      console.log("\nDesign selections:", des);
    }
  }
}

test().catch(console.error);
