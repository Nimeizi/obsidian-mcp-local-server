import esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2020",
  platform: "node",
  outfile: "main.js",
  sourcemap: "inline",
  logLevel: "info"
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
