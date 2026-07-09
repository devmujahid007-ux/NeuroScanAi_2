import React, { useMemo, useState } from "react";

const BASE_URL = "http://127.0.0.1:8000";

function toAbsoluteOutputUrl(outputImage) {
  if (!outputImage) return "";
  if (/^https?:\/\//i.test(outputImage)) return outputImage;
  return `${BASE_URL}${outputImage.startsWith("/") ? "" : "/"}${outputImage}`;
}

export default function UploadMRI() {
  const [t1c, setT1c] = useState(null);
  const [t1n, setT1n] = useState(null);
  const [t2f, setT2f] = useState(null);
  const [t2w, setT2w] = useState(null);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const outputImageUrl = useMemo(() => toAbsoluteOutputUrl(result?.output_image), [result]);

  const handleViewResult = async () => {
    setError("");
    setResult(null);

    if (!t1c || !t1n || !t2f || !t2w) {
      setError("Please upload all 4 MRI scans");
      return;
    }

    const formData = new FormData();
    formData.append("t1c", t1c);
    formData.append("t1n", t1n);
    formData.append("t2f", t2f);
    formData.append("t2w", t2w);

    try {
      setLoading(true);

      const response = await fetch(`${BASE_URL}/predict`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to process MRI scans");
      }
      if (!data?.output_image) {
        throw new Error("Backend did not return output_image");
      }

      setResult(data);
    } catch (e) {
      setError(e.message || "Failed to process MRI scans");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-10 px-6 md:px-10">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 border border-slate-200">
        <h1 className="text-3xl font-bold text-slate-800">Upload MRI</h1>
        <p className="text-slate-500 mt-2">Upload all 4 MRI modalities and click View Result.</p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">T1c (t1ce)</label>
            <input
              type="file"
              accept=".nii,.nii.gz,.dcm,.dicom"
              onChange={(e) => setT1c(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500 break-all">{t1c ? t1c.name : "No file selected"}</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">T1 (t1n)</label>
            <input
              type="file"
              accept=".nii,.nii.gz,.dcm,.dicom"
              onChange={(e) => setT1n(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500 break-all">{t1n ? t1n.name : "No file selected"}</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Flair (t2f)</label>
            <input
              type="file"
              accept=".nii,.nii.gz,.dcm,.dicom"
              onChange={(e) => setT2f(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500 break-all">{t2f ? t2f.name : "No file selected"}</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">T2 (t2w)</label>
            <input
              type="file"
              accept=".nii,.nii.gz,.dcm,.dicom"
              onChange={(e) => setT2w(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-2 text-xs text-slate-500 break-all">{t2w ? t2w.name : "No file selected"}</p>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={handleViewResult}
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "View Result"}
          </button>
        </div>

        {loading && <p className="mt-3 text-sm text-slate-600">Processing MRI scans...</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-800">{result.message}</h2>
            <p className="mt-1 text-slate-700">{result.tumor_volume}</p>
            <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 bg-black p-2">
              <img
                src={`${outputImageUrl}?t=${Date.now()}`}
                alt="Segmentation Result"
                style={{ width: "400px" }}
                className="max-w-full mx-auto"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
