import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { existsSync, copyFileSync } from "node:fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = join(process.cwd(), "test-output");
const ARTIFACTS_DIR = "C:\\Users\\Ali\\.gemini\\antigravity-ide\\brain\\3cc10be4-81a7-4a47-b872-dec628ab7463";

const files = [
  "verify_attendance_10emp_31days_auto",
  "verify_overtime_10emp_31days_auto",
  "verify_attendance_10emp_31days_fit-width",
  "verify_attendance_10emp_31days_actual",
  "verify_attendance_30emp_31days_auto"
];

for (const name of files) {
  const htmlPath = join(OUT_DIR, `${name}.html`);
  const pngPath = join(OUT_DIR, `${name}.png`);
  if (!existsSync(htmlPath)) {
    console.error(`Missing HTML: ${htmlPath}`);
    continue;
  }

  const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
  console.log(`Rendering screenshot for ${name}...`);
  execFileSync(CHROME_PATH, [
    "--headless=new",
    "--disable-gpu",
    "--window-size=1600,1050",
    "--hide-scrollbars",
    `--screenshot=${pngPath}`,
    fileUrl,
  ]);

  if (existsSync(pngPath)) {
    console.log(`Saved screenshot: ${pngPath}`);
    copyFileSync(pngPath, join(ARTIFACTS_DIR, `${name}.png`));
  }
}
console.log("Done generating screenshots!");
