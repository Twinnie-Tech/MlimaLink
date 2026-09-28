//@ts-check

const apiGatewayUrl = process.env.API_GATEWAY_URL || 'http://127.0.0.1:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
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
