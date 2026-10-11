// Server-side HTTP fetch for images and icons. Never exposed inside the sandbox.
import https from "node:https";
import http from "node:http";

export function httpFetch(url, maxBytes = 10_000_000, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 15000 }, (res) => {
      // Follow redirects (up to 3)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) { res.resume(); return reject(new Error("Too many redirects")); }
        return httpFetch(res.headers.location, maxBytes, redirectsLeft - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(); reject(new Error("Response too large")); return; }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

// Normalize arcData keys: startAngle/endAngle (SVG-style) → startingAngle/endingAngle (Figma API)
// Applied server-side so tests and real plugin both behave consistently.
export function normalizeArcData(arcData) {
  if (!arcData || typeof arcData !== "object") return arcData;
  return {
    startingAngle: arcData.startingAngle !== undefined ? arcData.startingAngle
                 : (arcData.startAngle   !== undefined ? arcData.startAngle : 0),
    endingAngle:   arcData.endingAngle   !== undefined ? arcData.endingAngle
                 : (arcData.endAngle     !== undefined ? arcData.endAngle   : Math.PI * 2),
    innerRadius:   arcData.innerRadius   !== undefined ? arcData.innerRadius : 0,
  };
}

