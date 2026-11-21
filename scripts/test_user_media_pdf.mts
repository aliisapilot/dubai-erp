import fs from "node:fs";
import { parsePdf } from "../lib/smartImport/parsers/pdfParser";
import { extractFromPdf } from "../lib/smartImport/extractor";

async function main() {
  const filePath = "C:/Users/Ali/.gemini/antigravity/brain/5fe1d774-8b72-49c2-8024-e93a6a09efb0/.user_uploaded/media_1793869516043_4234da08.pdf";
  if (!fs.existsSync(filePath)) {
    console.error("File does not exist:", filePath);
    return;
  }
  const buf = fs.readFileSync(filePath);
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  console.log("Parsing PDF...");
  const parsed = await parsePdf(arrayBuf, "media_1793869516043_4234da08.pdf");
  console.log("Pages count:", parsed.pagesCount);
  console.log("Total chars:", parsed.totalCharacterCount);
  console.log("Non-ws chars:", parsed.nonWhitespaceCharacterCount);
  console.log("Image ops:", parsed.imageOperatorCount);
  console.log("Has selectable text:", parsed.hasSelectableText);
  console.log("Is image only:", parsed.isImageOnly);

  for (let i = 0; i < parsed.pages.length; i++) {
    const page = parsed.pages[i];
    console.log(`\n--- Page ${page.pageNumber} (${page.lines.length} lines) ---`);
    console.log(page.lines.slice(0, 15).join("\n"));
  }

  console.log("\nRunning extractFromPdf with docType='customer_statement'...");
  const extracted = extractFromPdf(parsed, "SOA107-26 Al Karwan Solution FZC.pdf", "customer_statement");
  console.log("Extracted fields:", Object.keys(extracted.fields).map(k => `${k}: ${JSON.stringify(extracted.fields[k].value)}`));
  console.log("Extracted items count:", extracted.items.length);
  if (extracted.items.length > 0) {
    console.log("First item:", extracted.items[0]);
    console.log("Last item:", extracted.items[extracted.items.length - 1]);
  }
}

main().catch(console.error);
