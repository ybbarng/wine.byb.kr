import FluidLabMount from "@/components/FluidLabMount";

// WebGPU 유체 실험 페이지 (홈과 분리해 안전하게 개발)
export default function LabPage() {
  return (
    <div className="h-screen w-screen">
      <FluidLabMount />
    </div>
  );
}
