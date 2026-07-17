/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cover images are served from Supabase Storage via plain <img>, so no
  // remote image config is needed. Keep the config minimal on purpose.
  reactStrictMode: true,
};

export default nextConfig;
