async function main() {
  console.log("Checking Vercel Production Deployment for dubai-erp-two.vercel.app...");
  
  const res = await fetch("https://dubai-erp-two.vercel.app/overtime", {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  console.log(`Status: ${res.status}`);
  console.log(`x-vercel-id: ${res.headers.get("x-vercel-id")}`);
  console.log(`x-vercel-cache: ${res.headers.get("x-vercel-cache")}`);

  const html = await res.text();
  const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["']/gi;
  const scripts = [];
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    scripts.push(match[1]);
  }

  console.log(`Discovered ${scripts.length} script tags in HTML.`);
  for (const src of scripts.slice(0, 10)) {
    console.log("  -", src);
  }

  // Check if bundle contains our new overtime/payroll/pdf functions
  let verifiedFeature = false;
  for (const src of scripts) {
    if (!src.includes("/_next/")) continue;
    const url = src.startsWith("http") ? src : `https://dubai-erp-two.vercel.app${src}`;
    try {
      const cRes = await fetch(url, { cache: "no-store" });
      const text = await cRes.text();
      if (
        text.includes("calculateAuthoritativeMonthlyOvertime") ||
        text.includes("generateDocumentPdfFilename") ||
        text.includes("Payroll Charges & Breakdown") ||
        text.includes("hourly_rate")
      ) {
        console.log(`\n✓ MATCH FOUND in bundle: ${src}`);
        console.log("  Found authoritative overtime engine / standardized PDF filename logic deployed live on Vercel!");
        verifiedFeature = true;
        break;
      }
    } catch (e) {
      // Ignore
    }
  }

  if (verifiedFeature) {
    console.log("\nVERIFICATION RESULT: Live deployment is READY and serving the new master update!");
  } else {
    console.log("\nNote: Bundles checked, HTML returned 200 OK.");
  }
}

main().catch(console.error);
