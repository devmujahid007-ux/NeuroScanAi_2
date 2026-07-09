import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { absoluteUrl, getAnalysis, reportPdfOpenUrl } from "../api";

export default function ResultsPage() {
  const { reportId } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getAnalysis(reportId);
        if (!cancelled) {
          setReport(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading result...</div>;
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="bg-white border border-red-200 rounded-xl p-6 max-w-lg w-full text-center">
          <h1 className="text-xl font-semibold text-slate-800">Unable to load result</h1>
          <p className="text-slate-500 mt-2">{error || "Report data is unavailable."}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white py-10 px-6 md:px-10">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{report.prediction}</h1>
              <p className="text-sm text-slate-500 mt-1">Report #{report.id}</p>
              <p className="text-sm text-slate-500 mt-1">Patient: {report.patient?.name || "Unknown patient"}</p>
              <p className="text-sm text-slate-500 mt-1">Doctor: {report.doctor?.name || report.doctor?.email || "Assigned doctor"}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">{Math.round(report.confidence)}%</div>
              <div className="text-xs text-slate-500">confidence</div>
            </div>
          </div>

          <div className="mt-6 border rounded-xl overflow-hidden bg-black">
            <img
              src={absoluteUrl(report.imageUrl)}
              alt={`MRI scan ${report.scan_id}`}
              className="w-full h-[420px] object-contain"
            />
          </div>

          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-800">Summary</h2>
              <p className="text-sm text-slate-600 mt-2">{report.explanation}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-800">Recommended Next Steps</h2>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {(report.suggestedNextSteps || []).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800">Report Details</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div><strong>Date:</strong> {report.date ? new Date(report.date).toLocaleString() : "Unknown"}</div>
              <div><strong>Prediction:</strong> {report.label}</div>
              <div><strong>Confidence:</strong> {Math.round(report.confidence)}%</div>
              <div><strong>Scan:</strong> {report.fileName || `Scan #${report.scan_id}`}</div>
              {report.segmentation && (
                <>
                  <div><strong>Estimated volume:</strong> {report.segmentation.tumor_volume_cm3 != null ? `${report.segmentation.tumor_volume_cm3} cm³` : "—"}</div>
                  <div><strong>Model-indicated location:</strong> {report.segmentation.tumor_location || "—"}</div>
                  <div><strong>Severity (volume-based):</strong> {report.segmentation.severity || "—"}</div>
                  <div><strong>AI model:</strong> {report.segmentation.model_name || "—"}</div>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800">Actions</h2>
            <div className="mt-3 grid gap-3">
              {report.reportDownloadUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const id = Number(report.id);
                      const url = reportPdfOpenUrl(id, { download: false });
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                    className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-center hover:bg-blue-700"
                  >
                    View PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const id = Number(report.id);
                      const url = reportPdfOpenUrl(id, { download: true });
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                    className="w-full px-4 py-2 rounded-lg border border-slate-300 text-slate-800 text-center hover:bg-slate-50"
                  >
                    Download PDF
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => window.history.back()}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-center"
              >
                Back
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
