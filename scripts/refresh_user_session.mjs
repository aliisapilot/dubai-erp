import fs from "fs";
import path from "path";

const basePath = "C:\\Users\\Ali\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Local Storage\\leveldb";

export function getFreshSession() {
  if (!fs.existsSync(basePath)) return null;
  const files = fs.readdirSync(basePath).filter(f => f.endsWith(".ldb") || f.endsWith(".log"));
  // Sort newest first
  files.sort((a, b) => {
    const sA = fs.statSync(path.join(basePath, a));
    const sB = fs.statSync(path.join(basePath, b));
    return sB.mtimeMs - sA.mtimeMs;
  });

  for (const f of files) {
    try {
      const buf = fs.readFileSync(path.join(basePath, f));
      const content = buf.toString("utf8");
      const key = "sb-fdporzhjpfpvdwapkvan-auth-token";
      let idx = content.indexOf(key);
      while (idx !== -1) {
        const braceStart = content.indexOf("{", idx);
        if (braceStart !== -1) {
          for (let end = braceStart + 100; end < Math.min(content.length, braceStart + 5000); end++) {
            if (content[end] === "}") {
              const candidate = content.slice(braceStart, end + 1);
              try {
                const parsed = JSON.parse(candidate);
                if (parsed.access_token) {
                  return parsed;
                }
              } catch (e) {}
            }
          }
        }
        idx = content.indexOf(key, idx + 1);
      }
    } catch (e) {}
  }
  return null;
}

const session = getFreshSession();
if (session) {
  if (!fs.existsSync("scratch")) fs.mkdirSync("scratch");
  fs.writeFileSync("scratch/user_session.json", JSON.stringify(session, null, 2));
  console.log("✓ Successfully refreshed session from Chrome. Token expires at:", new Date((session.expires_at || 0) * 1000).toISOString());
} else {
  console.log("❌ Could not extract fresh session.");
}
