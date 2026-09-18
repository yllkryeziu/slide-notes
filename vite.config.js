import { defineConfig } from "vite";
import { cp, mkdir } from "node:fs/promises";

// Ship PDF.js fonts and decoders on the same origin as the app.
const pdfAssets = {
  name: "pdf-preview-assets",
  async buildStart() {
    await mkdir("public/pdfjs", { recursive: true });
    for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
      await cp(
        `node_modules/pdfjs-dist/${directory}`,
        `public/pdfjs/${directory}`,
        { recursive: true },
      );
    }
  },
};

export default defineConfig({
  plugins: [pdfAssets],
  base: "./",
  worker: { format: "es" },
  build: { target: "es2022" },
});
