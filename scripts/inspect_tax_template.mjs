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
  env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
);

async function inspectTaxTemplate() {
  await supabase.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  });

  const { data: tpl } = await supabase
    .from("document_templates")
    .select("*")
    .eq("id", "6a16ff99-ab40-40f1-b49e-be6139e2e1bb")
    .single();

  console.log("Template:", tpl.template_name, "Version:", tpl.version);
  const elements = tpl.layout_json?.elements || [];
  console.log(`Total elements: ${elements.length}`);
  const customTexts = elements.filter((e) => e.type === "custom_text");
  console.log("\nCustom text elements JSON:\n", JSON.stringify(customTexts, null, 2));
}

inspectTaxTemplate().catch(console.error);
