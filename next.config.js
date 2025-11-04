/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disable strict mode to avoid double mounting
  images: {
    domains: [],
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Enable instrumentation hook for auto-initialization
  experimental: {
    instrumentationHook: true,
    // Mark pg as external to prevent client-side bundling
    serverComponentsExternalPackages: ['pg', '@vercel/postgres'],
  },
  // Optimized for Vercel deployment
  // Remove CSP headers for development - browser extensions/settings might override them anyway
}

module.exports = nextConfig

