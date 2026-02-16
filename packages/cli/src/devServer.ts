import { loadGlossConfig } from "./config.js";
import { startServer } from "./server.js";

async function main() {
  const cfg = await loadGlossConfig();
  const { port } = await startServer(cfg, 5179);
  console.log(`Gloss API running at http://localhost:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
