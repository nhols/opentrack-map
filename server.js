import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

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

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  await serveFileFromRoot(pathname, ROOT, res, { appShell: true });
}

async function serveFileFromRoot(pathname, root, res, options = {}) {
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
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
  await serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`OpenTrack map running at http://${HOST}:${PORT}`);
});
