//@ts-check

const apiGatewayUrl = process.env.API_GATEWAY_URL || 'http://127.0.0.1:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace libraries export TypeScript source, so Next must compile them.
  transpilePackages: ['@org/chat-ui', '@org/models'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiGatewayUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
