"use client";
import dynamic from "next/dynamic";
const PathTraceShowcase = dynamic(() => import("@/components/PathTraceShowcase"), {
  ssr: false,
  loading: () => null,
});
export default function Mount() {
  return <PathTraceShowcase />;
}
