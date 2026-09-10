import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WebGPU/WebGL 캔버스(FluidLab)는 Strict Mode의 이중 마운트에서 컨텍스트를 잃는다.
  // dev에서 캔버스를 안정적으로 유지하려면 이중 마운트를 끈다.
  reactStrictMode: false,
};

export default nextConfig;
