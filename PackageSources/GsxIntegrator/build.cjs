const copyStaticFiles = require("esbuild-copy-static-files");
const globalExternals = require("@fal-works/esbuild-plugin-global-externals");
const { typecheckPlugin } = require("@jgoz/esbuild-plugin-typecheck");
const esbuild = require("esbuild");
const postcss = require("postcss");
const postCssUrl = require("postcss-url");
const postcssPrefixSelector = require("postcss-prefix-selector");
const sassPlugin = require("esbuild-sass-plugin");

require("dotenv").config({ path: __dirname + "/.env" });

const APP_NAME = "GsxIntegrator";

const env = {
  typechecking: process.env.TYPECHECKING === "true",
  sourcemaps: process.env.SOURCE_MAPS === "true",
  minify: process.env.MINIFY === "true",
};

const baseConfig = {
  entryPoints: [`src/${APP_NAME}.tsx`],
  keepNames: true,
  bundle: true,
  outdir: "dist",
  sourcemap: env.sourcemaps,
  minify: env.minify,
  logLevel: "info",
  loader: {
    ".html": "copy",
  },
  target: "es2017",
  define: { BASE_URL: `"coui://html_ui/efb_ui/efb_apps/${APP_NAME}"` },
  plugins: [
    copyStaticFiles({
      src: "./src/Assets",
      dest: "./dist/Assets",
    }),
    globalExternals.globalExternals({
      "@microsoft/msfs-sdk": {
        varName: "msfssdk",
        type: "cjs",
      },
    }),
    sassPlugin.sassPlugin({
      async transform(source) {
        const { css } = await postcss([
          postCssUrl({ url: "copy" }),
          postcssPrefixSelector({ prefix: `.efb-view.${APP_NAME}` }),
        ]).process(source, { from: undefined });
        return css;
      },
    }),
  ],
};

if (env.typechecking) {
  baseConfig.plugins.push(typecheckPlugin({ watch: process.env.SERVING_MODE === "WATCH" }));
}

if (process.env.SERVING_MODE === "WATCH") {
  esbuild.context(baseConfig).then((ctx) => ctx.watch());
} else if (["", undefined].includes(process.env.SERVING_MODE)) {
  esbuild.build(baseConfig);
} else {
  console.error(`MODE ${process.env.SERVING_MODE} is unknown`);
  process.exitCode = 1;
}
