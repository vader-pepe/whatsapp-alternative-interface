import { defineConfig } from "vite";
// import tailwindcss from "@tailwindcss/vite";
import tailwindcss from "./node_modules/@tailwindcss/vite/dist/index.mjs";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: "esnext",
  },
});
