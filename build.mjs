import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  outfile: "dist/bundle.js",
  format: "esm",
  minify: true,
  loader: { ".tsx": "tsx", ".ts": "ts", ".json": "json", ".svg": "dataurl", ".jpg": "dataurl", ".png": "dataurl" },
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

console.log("build ok");
