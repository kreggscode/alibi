import { defineConfig } from "vitest/config";

// Served from GitHub Pages at /alibi/.
export default defineConfig({
    base: "/alibi/",
    build: {
        outDir: "dist",
        sourcemap: false,
    },
    test: {
        environment: "node",
        include: ["src/**/*.test.ts"],
    },
});
