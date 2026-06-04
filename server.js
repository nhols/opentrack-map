import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = new URL("./public/", import.meta.url);
const OPEN_TRACK_API = "https://data.opentrack.run/api/competitions/";

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...headers
  });
  res.end(body);
}

async function proxyCompetitions(req, res) {
  const incoming = new URL(req.url, `http://${req.headers.host}`);
  const target = new URL(OPEN_TRACK_API);
  incoming.searchParams.forEach((value, key) => {
    if (key !== "source") target.searchParams.set(key, value);
  });

  try {
    const response = await fetch(target, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36"
      }
    });
    const body = await response.text();
    const isJson = response.headers.get("content-type")?.includes("application/json");

    if (!response.ok || !isJson) {
      send(
        res,
        502,
        JSON.stringify({
          error: "OpenTrack did not return JSON.",
          status: response.status,
          preview: body.slice(0, 240)
        }),
        { "content-type": "application/json; charset=utf-8" }
      );
      return;
    }

    send(res, 200, body, {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8"
    });
  } catch (error) {
    send(
      res,
      502,
      JSON.stringify({ error: error.message }),
      { "content-type": "application/json; charset=utf-8" }
    );
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const fileUrl = new URL(`.${safePath}`, ROOT);

  if (!fileUrl.href.startsWith(ROOT.href)) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    const body = await readFile(fileUrl);
    res.writeHead(200, {
      "content-type": types[extname(fileUrl.pathname)] || "application/octet-stream"
    });
    res.end(body);
  } catch {
    const fallback = await readFile(join(ROOT.pathname, "index.html"));
    res.writeHead(200, { "content-type": types[".html"] });
    res.end(fallback);
  }
}

const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/opentrack")) {
    await proxyCompetitions(req, res);
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`OpenTrack map running at http://${HOST}:${PORT}`);
});
