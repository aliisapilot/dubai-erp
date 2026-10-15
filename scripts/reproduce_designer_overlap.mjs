import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = join(process.cwd(), "test-output");

console.log("=== REPRODUCING DESIGNER SCREENSHOT & DOM INSPECTION ===");

// Fetch DOM from http://localhost:3000/settings/designer
const dom = execFileSync(
  CHROME_PATH,
  ["--headless=new", "--disable-gpu", "--dump-dom", "http://localhost:3000/settings/designer"],
  { maxBuffer: 20 * 1024 * 1024 }
).toString("utf8");

writeFileSync(join(OUT_DIR, "designer_live_dom.html"), dom, "utf8");
console.log("Dumped live DOM to test-output/designer_live_dom.html (Length:", dom.length, ")");

// Capture full screenshot of http://localhost:3000/settings/designer
const screenshotPath = join(OUT_DIR, "designer_live_view.png");
execFileSync(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  `--screenshot=${screenshotPath}`,
  "--window-size=1920,1080",
  "http://localhost:3000/settings/designer",
]);

console.log("Captured live designer screenshot to:", screenshotPath);
