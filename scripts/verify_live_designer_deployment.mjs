async function verifyLiveDesigner() {
  console.log("Checking live Vercel production deployment: https://dubai-erp-two.vercel.app/settings/designer ...");

  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      const res = await fetch("https://dubai-erp-two.vercel.app/settings/designer", {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      console.log(`[Attempt ${attempt}] Status: ${res.status}, x-vercel-id: ${res.headers.get("x-vercel-id")}`);
      const html = await res.text();

      const scriptUrls = [...html.matchAll(/src="(\/_next\/[^"]+)"/g)].map((m) => m[1]);
      let verified = false;

      for (const src of scriptUrls) {
        const chunkRes = await fetch("https://dubai-erp-two.vercel.app" + src, { cache: "no-store" });
        const text = await chunkRes.text();
        if (text.includes("Auto Fit Columns") && text.includes("Auto Fit Rows")) {
          console.log("✓ VERIFIED: Live production bundle contains new PDF Designer repairs in chunk:", src);
          verified = true;
          break;
        }
      }

      if (verified) {
        console.log(">>> SUCCESS: Production deployment is READY and verified with all PDF Designer repairs! <<<");
        return true;
      }
    } catch (err) {
      console.log(`[Attempt ${attempt}] Error: ${err.message}`);
    }

    console.log("Waiting 10s for Vercel build to finalize...");
    await new Promise((r) => setTimeout(r, 10000));
  }

  throw new Error("Timeout waiting for Vercel deployment with new PDF Designer code");
}

verifyLiveDesigner()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
