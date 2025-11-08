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
    // Mark pg and related packages as external to prevent client-side bundling
    // These are server-only packages that use Node.js built-ins (fs, net, etc.)
    serverComponentsExternalPackages: ['pg', '@vercel/postgres', 'pg-connection-string', 'pgpass'],
  },
  // Webpack configuration to suppress pg-native warnings and handle Node.js built-ins
  webpack: (config, { isServer }) => {
    // Suppress pg-native warnings (optional native binding, not needed for JavaScript implementation)
    // pg-native is an optional native module that provides performance improvements but isn't required
    config.resolve.alias = {
      ...config.resolve.alias,
      'pg-native': false,
    };
    
    // Handle Node.js built-in modules for client-side bundling
    // These are only available server-side, so we need to provide fallbacks
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'pg-native': false,
        'fs': false,
        'net': false,
        'tls': false,
        'crypto': false,
        'stream': false,
        'url': false,
        'zlib': false,
        'http': false,
        'https': false,
        'assert': false,
        'os': false,
        'path': false,
      };
    } else {
      // Server-side: just ignore pg-native
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'pg-native': false,
      };
    }
    
    // Suppress warnings about missing optional dependencies
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /node_modules\/pg\/lib\/native/,
        message: /Can't resolve 'pg-native'/,
      },
      {
        module: /node_modules\/pg-connection-string/,
        message: /Can't resolve 'fs'/,
      },
      {
        module: /node_modules\/pgpass/,
        message: /Can't resolve 'path'/,
      },
    ];
    
    return config;
  },
  // Optimized for Vercel deployment
  // Remove CSP headers for development - browser extensions/settings might override them anyway
}

module.exports = nextConfig

