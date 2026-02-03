const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src", "locales");
const distDir = path.join(root, "dist", "locales");

if (!fs.existsSync(srcDir)) {
  process.exit(0);
}

fs.mkdirSync(distDir, { recursive: true });

for (const entry of fs.readdirSync(srcDir)) {
  if (!entry.endsWith(".json")) continue;
  const from = path.join(srcDir, entry);
  const to = path.join(distDir, entry);
  fs.copyFileSync(from, to);
}
