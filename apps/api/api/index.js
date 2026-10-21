// Vercel entrypoint: serves the tsup bundle (built by `npm run build`), which
// inlines the shared workspace package. Locally, use `npm run dev` instead.
export { default } from "../dist/index.js";
