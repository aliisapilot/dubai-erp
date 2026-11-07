async function main() {
  const htmlRes = await fetch("https://dubai-erp-two.vercel.app/inventory/products", {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await htmlRes.text();
  console.log("Status:", htmlRes.status);
  console.log("x-vercel-id:", htmlRes.headers.get("x-vercel-id"));
  console.log("age:", htmlRes.headers.get("age"));

  const matches = [...html.matchAll(/src="(\/_next\/[^"]+)"/g)].map((m) => m[1]);
  console.log("Total script chunks in HTML:", matches.length);

  let foundNewUI = false;
  let foundOldUI = false;

  for (const src of matches) {
    try {
      const chunkRes = await fetch("https://dubai-erp-two.vercel.app" + src, { cache: "no-store" });
      const chunk = await chunkRes.text();
      if (chunk.includes("Add Product / Material") || chunk.includes("Products & Materials") || chunk.includes("Stock In")) {
        console.log("✓ Found NEW inventory UI in chunk:", src);
        foundNewUI = true;
      }
      if (chunk.includes("Add Material") || chunk.includes("Add Product / Material")) {
        // check specifics
      }
    } catch (e) {
      console.error("Chunk fetch error:", e.message);
    }
  }

  // Also check if Chrome can render and screenshot or evaluate
  return foundNewUI;
}

main().then((res) => {
  console.log("Result - New UI active:", res);
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
