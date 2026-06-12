/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy hacia el API Fastify para evitar CORS: el cliente llama /api/...
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:3000"}/:path*`,
      },
      {
        source: "/insta/:path*",
        destination: `${process.env.INSTA_URL ?? "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
