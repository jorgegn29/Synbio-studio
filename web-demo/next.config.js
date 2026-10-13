/** @type {import('next').NextConfig} */
// GitHub Pages serves this repo at https://<user>.github.io/Synbio-studio/
// Asset URLs must use that path. Local `next dev` keeps an empty base path.
const pagesBase = process.env.NEXT_PUBLIC_BASE_PATH
  ?? (process.env.NODE_ENV === 'production' ? '/Synbio-studio' : '');

const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  experimental: {
    // Browser demo imports the vscode-free scientific modules under client/src.
    externalDir: true,
  },
  ...(pagesBase ? { basePath: pagesBase, assetPrefix: pagesBase } : {}),
};

module.exports = nextConfig;
