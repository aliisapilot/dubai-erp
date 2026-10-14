import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}

const token = "eyJhbGciOiJFUzI1NiIsImtpZCI6Ijc3ZDBjZTNmLTM5ZTEtNGEwZC04OWYxLTE5NTFlZWU1OGU0OSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL2ZkcG9yemhqcGZwdmR3YXBrdmFuLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIwYmUzZWI4MC1kNTk3LTQ1Y2ItODkxZi1hODA1YzZmYWEyNmEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzkyMDA1NjI3LCJpYXQiOjE3OTIwMDIwMjcsImVtYWlsIjoibWlybW9oYW1tZWRhbGlhc2doYXJAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbF92ZXJpZmllZCI6dHJ1ZX0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3OTA4Nzg1NTl9XSwic2Vzc2lvbl9pZCI6ImViOGVlMTI0LTExZjItNDg3My04YzA1LTQwMGJhY2QwNWJkNyIsImlzX2Fub255bW91cyI6ZmFsc2V9.H93xMc4HRnXqZMvKijwXnDrFFNhgF9CjLdFYgTZcZSvp_l-G0jvweH4Kq26gm5n_exa3Zrw5szcoCFQ0fYsQCA";

const supabase = createClient(
  env["NEXT_PUBLIC_SUPABASE_URL"],
  env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] || env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  {
    global: {
      headers: {
        Authorization: "Bearer " + token,
      },
    },
  }
);

async function run() {
  console.log("=== CHECKING AUTHENTICATED USER & SAVED TEMPLATES ===");
  const { data: user, error: uErr } = await supabase.auth.getUser(token);
  console.log("Auth user:", user?.user?.email, "Err:", uErr?.message || "none");

  const { data: companies, error: cErr } = await supabase.from("companies").select("*");
  console.log("Companies count:", companies?.length, "Err:", cErr?.message || "none");
  if (companies && companies.length > 0) {
    for (const c of companies) {
      console.log("\nCompany:", c.name, "ID:", c.id);
      console.log("  Legal Name:", c.legal_name);
      console.log("  Arabic Name:", c.arabic_name);
      console.log("  TRN:", c.trn);
      console.log("  Address:", c.address);

      const { data: tpls, error: tErr } = await supabase
        .from("document_templates")
        .select("id, template_name, document_type, is_default, layout_json")
        .eq("company_id", c.id);

      console.log("  Templates found in Supabase:", tpls ? tpls.length : 0, "Err:", tErr?.message || "none");
      if (tpls && tpls.length > 0) {
        for (const t of tpls) {
          console.log(`\n  --- Template: "${t.template_name}" [${t.document_type}] (is_default: ${t.is_default}) ---`);
          const elems = t.layout_json?.elements || [];
          console.log("    Total elements in layout_json:", elems.length);
          const headerElems = elems.filter((e) =>
            ["logo", "company_name_en", "company_name_ar", "company_address", "doc_title"].includes(e.id)
          );
          headerElems.forEach((e) => {
            console.log(
              `      [${e.id}] x=${e.x} y=${e.y} w=${e.width} h=${e.height} font=${e.fontSize} text="${(e.text || e.customText || "").substring(0, 30)}"`
            );
          });
        }
      }
    }
  }

  const { data: taxTpl } = await supabase
    .from("document_templates")
    .select("*")
    .eq("id", "6a16ff99-ab40-40f1-b49e-be6139e2e1bb")
    .single();

  console.log("\n=======================================================");
  console.log("ACTIVE CLOUD TAX INVOICE TEMPLATE:");
  console.log("Name:", taxTpl?.template_name, "Version:", taxTpl?.version);
  const elements = taxTpl?.layout_json?.elements || [];
  elements.forEach((e) => {
    console.log(
      `  [${e.id.padEnd(20)}] type=${e.type.padEnd(18)} x=${String(e.x).padStart(5)} y=${String(e.y).padStart(5)} w=${String(e.width).padStart(5)} h=${String(e.height).padStart(5)} font=${String(e.fontSize).padStart(4)} text="${(e.text || e.customText || "").substring(0, 30)}"`
    );
  });
  console.log("=======================================================\n");
}

run().catch(console.error);
