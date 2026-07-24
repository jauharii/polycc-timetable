/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // Set NEXT_PUBLIC_BASE_PATH for GitHub Pages subpath (e.g. /repo-name)
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

export default nextConfig;