// @ts-check
// `npm run preview`: serve the committed dist/ under http://127.0.0.1:4173/preview/ (a
// subpath, so relative asset URLs are exercised like a gateway path). PORT overrides the port.
// Runs in the foreground until Ctrl-C. No rebuild happens; what you see is what is published.
import { DIST, serveStatic } from "./lib.mjs";

const port = Number(process.env.PORT ?? 4173);
const { url, close } = await serveStatic(DIST, { port });
console.log(`preview: ${url}  (Ctrl-C to stop)`);
const stop = () => close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
