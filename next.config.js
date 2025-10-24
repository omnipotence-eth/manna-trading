/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disable strict mode to avoid double mounting
  images: {
    domains: [],
  },
  // Remove CSP headers for development - browser extensions/settings might override them anyway
}

module.exports = nextConfig

