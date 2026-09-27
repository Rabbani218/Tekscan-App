/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large model files to be served from /public
  // No special config needed for static TF.js model files

  // Webpack config: handle TF.js properly in browser
  webpack: (config, { isServer }) => {
    if (isServer) {
      // TF.js should not be bundled on server side
      config.externals = config.externals || [];
      config.externals.push('@tensorflow/tfjs');
    }
    return config;
  },
};

module.exports = nextConfig;
