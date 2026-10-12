import path from "node:path";
import { defineConfig } from "waku/config";
import tailwindcss from "@tailwindcss/vite";
import press from "fumapress/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";

const appDir = import.meta.dirname;
const handbookDir = path.resolve(appDir, "../../docs/handbuch");

export default defineConfig({
  basePath: process.env.HANDBUCH_BASE_PATH ?? "/",
  vite: {
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    server: {
      fs: {
        allow: [appDir, handbookDir],
      },
    },
    plugins: [press(), fumadocsMdx(), tailwindcss()],
  },
});
