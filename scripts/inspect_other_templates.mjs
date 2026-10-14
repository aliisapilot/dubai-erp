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

async function inspectOtherTemplates() {
  await supabase.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  });

  const { data: tpls } = await supabase
    .from("document_templates")
    .select("id, template_name, document_type, is_default, layout_json")
    .eq("company_id", "4dbb309a-f31c-4615-8bb5-59df7a6326e3");

  const docTypes = ["quotation", "proforma_invoice", "delivery_note", "purchase_order"];
  for (const dt of docTypes) {
    const t = tpls?.find((x) => x.document_type === dt && x.template_name === "Custom Style 5005");
    if (!t) {
      console.log(`\nNo Custom Style 5005 for ${dt}`);
      continue;
    }
    console.log(`\n==================================================`);
    console.log(`Template: ${t.template_name} [${t.document_type}] ID: ${t.id}`);
    const elems = t.layout_json?.elements || [];
    elems
      .filter((e) => e.y < 85 || e.type === "custom_text")
      .forEach((e) => {
        const text = e.text || e.customText || "";
        console.log(
          `  [${e.id.padEnd(32)}] type=${e.type.padEnd(18)} x=${String(e.x).padStart(5)} y=${String(e.y).padStart(5)} w=${String(e.width).padStart(5)} h=${String(e.height).padStart(5)} vis=${e.visible} font=${String(e.fontSize).padStart(4)} text="${text.substring(0, 30)}"`
        );
      });
  }
}

inspectOtherTemplates().catch(console.error);
