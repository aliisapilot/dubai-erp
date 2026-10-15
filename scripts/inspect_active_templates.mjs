import fs from "fs";
import { createClient } from "@supabase/supabase-js";

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

async function run() {
  console.log("=== INSPECTING ACTIVE SUPABASE TEMPLATES & COMPANIES ===");
  const { data: companies, error: cErr } = await supabase.from("companies").select("*");
  if (cErr) {
    console.error("Error fetching companies:", cErr);
    return;
  }
  console.log(`Found ${companies.length} company records:`);
  for (const c of companies) {
    console.log(`\nCompany ID: ${c.id}`);
    console.log(`  Name: ${c.name}`);
    console.log(`  Legal Name: ${c.legal_name}`);
    console.log(`  Arabic Name: ${c.arabic_name}`);
    console.log(`  TRN: ${c.trn}`);
    console.log(`  Address: ${c.address}`);

    const { data: tpls, error: tErr } = await supabase
      .from("document_templates")
      .select("id, template_name, document_type, is_default, layout_json")
      .eq("company_id", c.id);

    console.log(`  Saved Templates in Supabase: ${tpls ? tpls.length : 0} (error: ${tErr?.message || "none"})`);
    if (tpls && tpls.length > 0) {
      for (const t of tpls) {
        console.log(`    Template ID: ${t.id} | Name: "${t.template_name}" | DocType: ${t.document_type} | Default: ${t.is_default}`);
        const elements = t.layout_json?.elements || [];
        console.log(`    Total elements: ${elements.length}`);
        elements.forEach((e) => {
          console.log(`      -> id: "${e.id}", type: "${e.type}", label: "${e.label}", x: ${e.x}, y: ${e.y}, w: ${e.width}, h: ${e.height}, visible: ${e.visible}, text: "${e.text || e.customText || ""}"`);
        });
      }
    }

    const { data: des, error: dErr } = await supabase
      .from("document_design_selections")
      .select("*")
      .eq("company_id", c.id);
    console.log(`  Design selections:`, des, dErr?.message || "none");
  }
}

run().catch(console.error);
