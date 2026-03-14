import { defineConfig } from "vite";
import path from "path";
import basicSsl from "@vitejs/plugin-basic-ssl";

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
  resolve: {
    alias: {
      x: path.resolve(__dirname, "../../src/index.ts"),
      "@": path.resolve(__dirname, "../../src"),
      // Resolve from example's node_modules when bundling aliased ../../src code
      "@cartridge/controller": path.resolve(__dirname, "node_modules/@cartridge/controller"),
      // Extended-TS-SDK signer loads WASM via this path; resolve to package wasm dir
      "/wasm/stark_crypto_wasm-web.js": path.resolve(
        __dirname,
        "node_modules/extended-typescript-sdk/wasm/stark_crypto_wasm-web.js"
      ),
    },
  },
  optimizeDeps: {
    exclude: ["x", "extended-typescript-sdk"],
    include: ["@cartridge/controller"],
  },
  assetsInclude: ["**/*.wasm"],
});
