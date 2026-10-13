import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const userDataDir = path.join(process.cwd(), ".chrome-verify-profile");
  const chromeProc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--remote-debugging-port=9444",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "http://localhost:3000/attendance",
    ],
    { stdio: "ignore" }
  );

  let connected = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:9444/json/version");
      if (res.ok) {
        connected = true;
        break;
      }
    } catch {}
    await wait(250);
  }

  if (!connected) {
    chromeProc.kill();
    throw new Error("Could not connect to Chrome");
  }

  const targetsRes = await fetch("http://127.0.0.1:9444/json");
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === "page");

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });

  let id = 0;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const curId = ++id;
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === curId) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await send("Runtime.enable");
  await wait(3000);

  // Evaluate query to fetch all employees from supabase in browser context
  const evalRes = await send("Runtime.evaluate", {
    expression: `(async () => {
      // Find supabase client from window or modules if available, or fetch via supabase client
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        ls[k] = localStorage.getItem(k);
      }
      return ls;
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });

  const ls = evalRes.result.value;
  console.log("Local storage keys:", Object.keys(ls));
  for (const k of Object.keys(ls)) {
    if (k.includes("auth-token") || k.includes("supabase")) {
      console.log(`Found auth key ${k}`);
      fs.writeFileSync("scratch/user_session.json", ls[k]);
    }
  }

  ws.close();
  chromeProc.kill();
}

main().catch(console.error);
