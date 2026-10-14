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

function testStacking(elements) {
  const logoEl = elements.find((e) => e.id === "logo" && e.visible);
  const enEl = elements.find((e) => e.id === "company_name_en" && e.visible);
  const arEl = elements.find((e) => e.id === "company_name_ar" && e.visible);
  const addrEl = elements.find((e) => e.id === "company_address");
  const titleEl = elements.find((e) => e.id === "doc_title" && e.visible);
  const headerCustomTexts = elements
    .filter((e) => e.type === "custom_text" && e.visible && e.y < 65)
    .sort((a, b) => a.y - b.y);

  // Check collision
  let hasCollision = false;
  if (logoEl && enEl && logoEl.y + logoEl.height > enEl.y - 0.5) hasCollision = true;
  if (enEl && arEl && enEl.y + enEl.height > arEl.y - 0.5) hasCollision = true;
  for (const ct of headerCustomTexts) {
    if (enEl && Math.max(0, Math.min(ct.y + ct.height, enEl.y + enEl.height) - Math.max(ct.y, enEl.y)) > 0.5) hasCollision = true;
    if (arEl && Math.max(0, Math.min(ct.y + ct.height, arEl.y + arEl.height) - Math.max(ct.y, arEl.y)) > 0.5) hasCollision = true;
  }
  if (addrEl && addrEl.visible && arEl && arEl.y + arEl.height > addrEl.y - 0.5) hasCollision = true;

  console.log("Has header collision?", hasCollision);
  if (!hasCollision) return elements;

  // Perform dynamic stacking
  let curY = 10;
  const result = elements.map((e) => ({ ...e }));
  const getEl = (id) => result.find((e) => e.id === id);

  const l = getEl("logo");
  if (l && l.visible) {
    l.x = 80;
    l.y = curY;
    l.width = 50;
    l.height = 14;
    curY = l.y + l.height + 2.5; // 26.5
  }

  const en = getEl("company_name_en");
  if (en && en.visible) {
    en.x = 12;
    en.y = curY;
    en.width = 186;
    en.height = 8.0;
    curY = en.y + en.height + 1.0; // 35.5
  }

  const ar = getEl("company_name_ar");
  if (ar && ar.visible) {
    ar.x = 12;
    ar.y = curY;
    ar.width = 186;
    ar.height = 8.5;
    curY = ar.y + ar.height + 1.2; // 45.2
  }

  const addr = getEl("company_address");
  if (addr && addr.visible) {
    addr.x = 12;
    addr.y = curY;
    addr.width = 186;
    addr.height = 8.0;
    curY = addr.y + addr.height + 1.0;
  }

  const cts = result
    .filter((e) => e.type === "custom_text" && e.visible && e.y < 65)
    .sort((a, b) => a.y - b.y);

  for (const ct of cts) {
    ct.x = 12;
    ct.y = curY;
    ct.width = 186;
    ct.height = Math.max(5.0, Math.min(8.0, ct.height || 6.0));
    ct.textAlign = "center";
    curY = ct.y + ct.height + 1.0;
  }

  const t = getEl("doc_title");
  if (t && t.visible) {
    t.x = 12;
    t.y = Math.max(curY + 1.0, 56.0);
    t.width = 186;
    t.height = 10.5;
    curY = t.y + t.height + 2.5;
  }

  const cards = result.filter(
    (e) => ["customer_info", "supplier_info", "project_info", "doc_meta"].includes(e.type) || e.id === "doc_meta"
  );
  const cardY = Math.max(curY, 68.0);
  for (const c of cards) {
    if (c.y < 85) {
      c.y = cardY;
      c.height = Math.max(26.0, c.height);
    }
  }

  const table = getEl("line_items");
  if (table && table.y < cardY + 28) {
    table.y = cardY + 29;
  }

  return result;
}

async function run() {
  await supabase.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  });

  const { data: tpls } = await supabase
    .from("document_templates")
    .select("id, template_name, document_type, layout_json")
    .eq("company_id", "4dbb309a-f31c-4615-8bb5-59df7a6326e3");

  const docTypes = ["tax_invoice", "quotation", "proforma_invoice", "delivery_note", "purchase_order"];
  for (const dt of docTypes) {
    const t = tpls?.find((x) => x.document_type === dt && x.template_name === "Custom Style 5005");
    if (!t) continue;
    console.log(`\n=================== TESTING ${dt.toUpperCase()} ===================`);
    const elements = t.layout_json?.elements || [];
    const stacked = testStacking(elements);
    
    // Check collisions in stacked
    const headerItems = stacked.filter((e) => (e.y < 90 || e.type === "custom_text") && e.visible && e.type !== "watermark");
    headerItems.sort((a, b) => a.y - b.y);
    console.log("Stacked Header Order:");
    headerItems.forEach((h) => {
      const text = h.text || h.customText || "";
      console.log(`  y=${h.y.toFixed(1)} to ${(h.y + h.height).toFixed(1)} [${h.id}] font=${h.fontSize} "${text.substring(0, 30)}"`);
    });

    let colls = 0;
    for (let i = 0; i < headerItems.length; i++) {
      for (let j = i + 1; j < headerItems.length; j++) {
        const a = headerItems[i];
        const b = headerItems[j];
        if (a.id === "customer_info" && b.id === "doc_meta") continue; // side-by-side
        if (a.id === "supplier_info" && b.id === "doc_meta") continue; // side-by-side
        const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        if (xOverlap > 10 && yOverlap > 0.1) {
          console.log(`  !! COLLISION between [${a.id}] and [${b.id}] overlap=${yOverlap.toFixed(1)}mm`);
          colls++;
        }
      }
    }
    console.log(`Total Collisions for ${dt}: ${colls}`);
  }
}

run().catch(console.error);
