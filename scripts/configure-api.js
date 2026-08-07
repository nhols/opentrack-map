import { readFile, writeFile } from "node:fs/promises";

const configPath = new URL("../public/config.js", import.meta.url);
const apiRoot = process.env.OPENTRACK_API_ROOT?.trim().replace(/\/$/, "");

if (!apiRoot) {
  throw new Error("OPENTRACK_API_ROOT is required");
}

const url = new URL(apiRoot);
if (url.protocol !== "https:" || !url.hostname.endsWith(".workers.dev")) {
  throw new Error("OPENTRACK_API_ROOT must be an HTTPS workers.dev URL");
}
if (
  url.pathname !== "/api/competitions" ||
  url.username ||
  url.password ||
  url.port ||
  url.search ||
  url.hash
) {
  throw new Error("OPENTRACK_API_ROOT must be the Worker's /api/competitions URL");
}

const template = await readFile(configPath, "utf8");
if (!template.includes("__OPENTRACK_API_ROOT__")) {
  throw new Error("API configuration placeholder is missing");
}

await writeFile(configPath, template.replace("__OPENTRACK_API_ROOT__", apiRoot));
