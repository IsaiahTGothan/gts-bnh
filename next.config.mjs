/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Postgres driver (used once, to create the sync table) is loaded from
  // node_modules at runtime instead of being bundled into the API route.
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
