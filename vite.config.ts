import { defineConfig } from "vite";
import path from "path";
import { existsSync } from "fs";
import basicSsl from "@vitejs/plugin-basic-ssl";

const monorepoSrc = path.resolve(__dirname, "../../src");
const useMonorepoX = existsSync(path.join(monorepoSrc, "index.ts"));

/** Strip sourcemap comments from extended-typescript-sdk so missing source file warnings are avoided. */
function stripExtendedSdkSourcemaps() {
  return {
    name: "strip-extended-sdk-sourcemaps",
    transform(code: string, id: string) {
      if (!id.includes("extended-typescript-sdk")) return null;
      const stripped = code
        .replace(/\/\/# sourceMappingURL=.*$/gm, "")
        .replace(/\/\*# sourceMappingURL=.*?\*\//gs, "")
        .trimEnd();
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}

export default defineConfig({
  plugins: [stripExtendedSdkSourcemaps(), basicSsl()],
  define: {
    // Dependencies reference process.env; browser has no process
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  server: {
    https: true,
    allowedHosts: ["localhost", ".trycloudflare.com"],
    proxy: {
      "/api/extended": {
        target: "https://api.starknet.extended.exchange",
        changeOrigin: true,
        rewrite: (path) => path.slice("/api/extended".length),
      },
    },
  },
  preview: {
    proxy: {
      "/api/extended": {
        target: "https://api.starknet.extended.exchange",
        changeOrigin: true,
        rewrite: (path) => path.slice("/api/extended".length),
      },
    },
  },
  resolve: {
    alias: {
      // In monorepo: use local ../../src; on Vercel/standalone: use published "x" from node_modules
      ...(useMonorepoX
        ? {
            x: path.join(monorepoSrc, "index.ts"),
            "@": monorepoSrc,
          }
        : {}),
      // Resolve from this app's node_modules so monorepo x (../../src) can find starknet
      starknet: path.resolve(__dirname, "node_modules/starknet"),
      "@cartridge/controller": path.resolve(__dirname, "node_modules/@cartridge/controller"),
      "/wasm/stark_crypto_wasm-web.js": path.resolve(
        __dirname,
        "node_modules/extended-typescript-sdk/wasm/stark_crypto_wasm-web.js"
      ),
    },
  },
  optimizeDeps: {
    exclude: useMonorepoX ? ["x", "extended-typescript-sdk"] : ["extended-typescript-sdk"],
    include: ["@cartridge/controller"],
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    rollupOptions: {
      output: {
        intro: "typeof globalThis !== 'undefined' && (globalThis.process = globalThis.process || { env: { NODE_ENV: 'production' } });",
      },
    },
  },
});
