/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer has native deps (yoga-layout, fonts) that Next's
  // bundler shouldn't try to inline — let Node resolve it at runtime.
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
