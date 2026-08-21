"use client";

import dynamic from "next/dynamic";

const FluidLab = dynamic(() => import("./FluidLab"), {
  ssr: false,
  loading: () => null,
});

export default function FluidLabMount() {
  return <FluidLab />;
}
