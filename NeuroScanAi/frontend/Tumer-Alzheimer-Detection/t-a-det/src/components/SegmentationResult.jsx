import React from "react";

export default function SegmentationResult({ result, imageUrl, volume }) {
  if (!result && !imageUrl && (volume == null || volume === "")) {
    return null;
  }

  return (
    <section className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-xl font-semibold text-slate-800">Segmentation Result</h2>

      <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p className="text-slate-500">Prediction</p>
          <p className="mt-1 text-base font-semibold text-slate-800">{result || "N/A"}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p className="text-slate-500">Tumor Volume</p>
          <p className="mt-1 text-base font-semibold text-slate-800">{volume || "N/A"}</p>
        </div>
      </div>

      {imageUrl && (
        <div className="mt-5 rounded-xl overflow-hidden border border-slate-200 bg-black">
          <img src={imageUrl} alt="Segmentation Result" className="w-full max-h-[560px] object-contain" />
        </div>
      )}
    </section>
  );
}
