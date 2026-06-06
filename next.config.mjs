/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow large multipart uploads (CSV / receipt images) to API route handlers.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
