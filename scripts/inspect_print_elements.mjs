import { spawn } from "node:child_process";

const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  "--remote-debugging-port=9455",
  "--headless=new",
  "--disable-gpu",
  "http://localhost:3000/attendance"
]);

setTimeout(async () => {
  try {
    const list = await (await fetch("http://127.0.0.1:9455/json")).json();
    const wsUrl = list[0].webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      let id = 1;
      const send = (m, p={}) => ws.send(JSON.stringify({ id: id++, method: m, params: p }));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id === 2) {
          send("Runtime.evaluate", {
            expression: `(() => {
              const all = Array.from(document.querySelectorAll("body *"));
              const visible = [];
              for (const el of all) {
                const s = window.getComputedStyle(el);
                if (s.display !== "none" && s.visibility !== "hidden" && el.offsetHeight > 0 && el.children.length === 0) {
                  const rect = el.getBoundingClientRect();
                  if (!el.closest(".print-attendance-sheet")) {
                    visible.push({ tag: el.tagName, cls: typeof el.className === "string" ? el.className.slice(0, 30) : "", text: el.textContent.trim().slice(0, 30), top: rect.top, height: rect.height });
                  }
                }
              }
              return visible;
            })()`,
            returnByValue: true
          });
        }
        if (msg.id === 3) {
          console.log("VISIBLE ELEMENTS OUTSIDE PRINT SHEET COUNT:", msg.result.value?.length);
          console.log("Sample elements:", msg.result.value?.slice(0, 10));
          chrome.kill();
          process.exit(0);
        }
      };
      send("Emulation.setEmulatedMedia", { media: "print" });
      send("Runtime.enable");
    };
  } catch (err) {
    console.error(err);
    chrome.kill();
    process.exit(1);
  }
}, 3500);
