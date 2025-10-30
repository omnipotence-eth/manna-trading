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
  // Vercel deployment configuration
  output: 'standalone', // Optimize for serverless deployment
  // Remove CSP headers for development - browser extensions/settings might override them anyway
}

module.exports = nextConfig

