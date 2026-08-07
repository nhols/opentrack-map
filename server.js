import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { handleCompetitionRequest } from "./worker/competitions.js";

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = new URL("./public/", import.meta.url);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    ...headers
  });
  res.end(body);
}

async function sendWebResponse(res, response) {
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(body);
}

async function serveCompetitions(req, res, url) {
  if (req.method !== "GET") {
    send(res, 405, "Method not allowed", { allow: "GET" });
    return;
  }

  const response = await handleCompetitionRequest({
    request: new Request(url, { method: "GET", headers: req.headers }),
    env: process.env,
    cache: null
  });
  await sendWebResponse(res, response);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  await serveFileFromRoot(pathname, ROOT, res, { appShell: true });
}

async function serveFileFromRoot(pathname, root, res, options = {}) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    send(res, 400, "Bad request");
    return;
  }

  const safePath = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const fileUrl = new URL(safePath.replace(/^\/+/, ""), root);

  if (!fileUrl.href.startsWith(root.href)) {
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
    if (!options.appShell) {
      send(res, 404, "Not found");
      return;
    }

    const indexHtml = await readFile(join(ROOT.pathname, "index.html"));
    res.writeHead(200, { "content-type": types[".html"] });
    res.end(indexHtml);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/competitions" || url.pathname === "/api/competitions/") {
    await serveCompetitions(req, res, url);
    return;
  }
  await serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`OpenTrack map running at http://${HOST}:${PORT}`);
});
