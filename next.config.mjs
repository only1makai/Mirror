/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Privacy: no third-party analytics; keep the app self-contained.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
