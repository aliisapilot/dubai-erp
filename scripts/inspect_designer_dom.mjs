import fs from "fs";

const html = fs.readFileSync("test-output/designer_live_dom.html", "utf8");

console.log("=== ELEMENTS IN RENDERED DOM ===");
const elRegex = /data-element-id="([^"]+)"[^>]*style="([^"]+)"/g;
let match;
while ((match = elRegex.exec(html)) !== null) {
  console.log(`Element ID: ${match[1]} | Style: ${match[2]}`);
}

console.log("\n=== TEXT MATCHES IN DOM ===");
const textRegex = />([^<]*(?:BURAQ|DUBAI|AL BURAQ|COMPANY|ENTERPRISE|TAX INVOICE|فاتورة)[^<]*)</gi;
while ((match = textRegex.exec(html)) !== null) {
  const txt = match[1].trim();
  if (txt.length > 3) console.log(`  -> "${txt}"`);
}
