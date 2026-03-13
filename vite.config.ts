import { defineConfig } from "vite";
import { builtinModules } from "node:module";

export default defineConfig({
  build: {
    target: "node20",
    lib: {
      entry: "index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        ...builtinModules.map((m) => `node:${m}`),
        ...builtinModules,
        /^@modelcontextprotocol\//,
        "hono",
        /^hono\//,
        "@hono/node-server",
        "expression-eval",
        "zod",
      ],
    },
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    globals: true,
  },
});
