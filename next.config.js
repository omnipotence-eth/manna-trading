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
    serverComponentsExternalPackages: ['pg', '@vercel/postgres', 'pg-connection-string', 'pgpass', 'split2'],
  },
  // Webpack configuration to suppress pg-native warnings and handle Node.js built-ins
  webpack: (config, { isServer, webpack }) => {
    // Suppress pg-native warnings (optional native binding, not needed for JavaScript implementation)
    // pg-native is an optional native module that provides performance improvements but isn't required
    config.resolve.alias = {
      ...config.resolve.alias,
      'pg-native': false,
    };
    
    // CRITICAL FIX: Mark pg packages as external for BOTH server and client builds
    // This prevents Next.js from trying to bundle pg during build analysis
    const originalExternals = config.externals || [];
    config.externals = [
      ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
      function ({ request, context }, callback) {
        // Externalize pg and all its dependencies (for both server and client)
        if (/^pg-connection-string$|^pgpass$|^split2$|^pg$/.test(request)) {
          return callback(null, `commonjs ${request}`);
        }
        // If the request is from a pg-related package, externalize it
        if (context && /node_modules[\/\\](pg|pgpass|pg-connection-string|split2)/.test(context)) {
          return callback(null, `commonjs ${request}`);
        }
        // CRITICAL: For server builds, don't externalize Node.js built-ins (they're native)
        // For client builds, externalize them (handled in the client-side block below)
        callback();
      },
    ];
    
    // CRITICAL FIX: Prevent client-side bundling of server-only packages
    if (!isServer) {
      // Client-side: Use IgnorePlugin to completely ignore pg and related packages
      // This prevents webpack from even trying to resolve these modules
      config.plugins = config.plugins || [];
      
      // CRITICAL: Add alias FIRST to redirect lib/db imports to stub
      const dbStubPath = require('path').resolve(__dirname, 'lib/db.client-stub.ts');
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/lib/db': dbStubPath,
        'pg': false,
        'pg-native': false,
        'pg-connection-string': false,
        'pgpass': false,
        'split2': false,
      };
      
      // CRITICAL: Replace lib/db.ts FIRST before other plugins
      // This must happen before webpack tries to resolve the import chain
      config.plugins.push(
        // Replace lib/db.ts with client stub - try multiple patterns
        // Use more aggressive patterns to catch all import styles
        new webpack.NormalModuleReplacementPlugin(
          /^@\/lib\/db$/,
          dbStubPath
        ),
        new webpack.NormalModuleReplacementPlugin(
          /^@\/lib\/db\.ts$/,
          dbStubPath
        ),
        new webpack.NormalModuleReplacementPlugin(
          /lib[\/\\]db(\.ts)?$/,
          dbStubPath
        ),
        new webpack.NormalModuleReplacementPlugin(
          /.*[\/\\]lib[\/\\]db(\.ts)?$/,
          dbStubPath
        ),
        new webpack.NormalModuleReplacementPlugin(
          /[\/\\]lib[\/\\]db$/,
          dbStubPath
        ),
        // Ignore pg packages - MUST be in this order to catch all dependencies
        // CRITICAL: Use more aggressive patterns to catch all import styles
        new webpack.IgnorePlugin({
          resourceRegExp: /^pg-connection-string$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^pgpass$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^split2$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^pg$/,
        }),
        // CRITICAL: Also ignore pg submodules that might be imported directly
        new webpack.IgnorePlugin({
          resourceRegExp: /^pg\/lib\/connection-parameters$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^pg\/lib\/client$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^pg\/lib$/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^pg\/esm$/,
        })
      );
      
      // Client-side: Handle Node.js built-in modules and server-only packages
      // These are only available server-side, so we need to provide fallbacks
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'pg-native': false,
        'pg': false,
        'pgpass': false,
        'pg-connection-string': false,
        'split2': false, // split2 is a dependency of pgpass
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
      {
        module: /node_modules\/split2/,
        message: /Can't resolve 'stream'/,
      },
      {
        module: /node_modules\/pgpass/,
        message: /Can't resolve 'stream'/,
      },
      {
        module: /node_modules\/pg/,
        message: /Can't resolve 'stream'/,
      },
      {
        module: /node_modules\/pgpass/,
        message: /Can't resolve 'stream'/,
      },
    ];
    
    return config;
  },
  // Optimized for Vercel deployment
  // Remove CSP headers for development - browser extensions/settings might override them anyway
}

module.exports = nextConfig

