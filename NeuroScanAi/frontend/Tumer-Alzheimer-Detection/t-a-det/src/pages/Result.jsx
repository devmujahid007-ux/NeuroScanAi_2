import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getAnalysis, BASE_URL } from "../api";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

/**
 * Results.jsx
 * - Displays an AI analysis result for an MRI scan
 * - Mock data included; replace data loading with real API calls
 *
 * Dependencies:
 * - recharts (install: npm install recharts)
 * - Tailwind CSS for styles
 */

const ConfidencePie = ({ confidence }) => {
  const data = [
    { name: "Confidence", value: confidence },
    { name: "Remaining", value: 100 - confidence },
  ];
  return (
    <div style={{ width: 120, height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={36}
            outerRadius={48}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            <Cell key="c1" fill="#2563eb" />
            <Cell key="c2" fill="#e6eefb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-sm font-semibold text-slate-800">
          {Math.round(confidence)}%
        </div>
      </div>
    </div>
  );
};

export default function Results() {
  const { reportId } = useParams(); // optional param from route
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const id = reportId;
        const data = await getAnalysis(id);
        if (!cancelled) {
          setReport(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [reportId]);

  if (loading || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center py-20">
        <div className="text-center">
          <div className="loader mb-4" aria-hidden />
          <div className="text-slate-600">Loading analysis...</div>
        </div>
      </div>
    );
  }

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.id}-report.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    // Mock PDF generation (create a simple text-based PDF-like file)
    // Replace with real PDF generation (server-side or client-side via jsPDF)
    setExporting(true);
    setTimeout(() => {
      const text = `
        NeuroScan AI — Analysis Report
        Report ID: ${report.id}
        Patient: ${report.patient.name} (${report.patient.patientId})
        Date: ${report.date}
        Prediction: ${report.prediction}
        Confidence: ${Math.round(report.confidence)}%
        Notes: ${report.explanation}
      `;
      const blob = new Blob([text], { type: "application/pdf" }); // pseudo-PDF
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.id}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExporting(false);
    }, 1000);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white py-10 px-6 md:px-10">
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
        {/* Left: Image + controls */}
        <section className="md:col-span-2 bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{report.prediction}</h1>
              <div className="text-sm text-slate-500 mt-1">
                Report: <span className="font-medium text-slate-700">{report.id}</span> • {new Date(report.date).toLocaleDateString()}
              </div>
              <div className="text-sm text-slate-500 mt-2">
                Patient: <span className="font-medium text-slate-700">{report.patient.name}</span> · Age {report.patient.age} · ID {report.patient.patientId}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => alert("Annotate (mock)")}
                className="px-3 py-2 rounded-md border text-sm hover:bg-slate-50"
              >
                Annotate
              </button>

              <button
                onClick={() => alert("Share (mock)")}
                className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                Share
              </button>
            </div>
          </div>

          {/* Image + overlay */}
          <div className="mt-6 grid md:grid-cols-12 gap-4">
            <div className="md:col-span-8">
              <div className="relative bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                {/* base MRI image */}
                <img
                  src={report.imageUrl && report.imageUrl.startsWith("http") ? report.imageUrl : (BASE_URL + report.imageUrl)}
                  alt={`MRI ${report.id}`}
                  className="w-full h-[420px] object-contain bg-black"
                />

                {/* heatmap overlay */}
                {showHeatmap && (
                  <img
                    src={report.heatmapUrl && report.heatmapUrl.startsWith("http") ? report.heatmapUrl : (BASE_URL + report.heatmapUrl)}
                    alt="Heatmap overlay"
                    className="absolute top-0 left-0 w-full h-full object-cover mix-blend-multiply pointer-events-none"
                    aria-hidden
                  />
                )}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                    className="form-checkbox h-4 w-4 text-blue-600"
                    aria-label="Toggle heatmap overlay"
                  />
                  Show explainability heatmap
                </label>

                <button
                  onClick={() => alert("Zoom (mock)")}
                  className="ml-2 text-sm px-3 py-1 rounded-md border hover:bg-slate-50"
                >
                  Zoom
                </button>

                <button
                  onClick={() => alert("Compare (mock)")}
                  className="text-sm px-3 py-1 rounded-md border hover:bg-slate-50"
                >
                  Compare with previous
                </button>
              </div>

              {/* Explanation & next steps */}
              <div className="mt-6 bg-slate-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-800">Model Explanation</h3>
                <p className="text-sm text-slate-600 mt-2">{report.explanation}</p>

                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-slate-800">Suggested next steps</h4>
                  <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
                    {report.suggestedNextSteps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Right column within the main content */}
            <aside className="md:col-span-4">
              <div className="bg-white rounded-lg border p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm text-slate-700">Prediction</h4>
                    <div className="text-lg font-semibold text-slate-800 mt-1">{report.label}</div>
                  </div>

                  <div className="relative">
                    <ConfidencePie confidence={report.confidence} />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500 mb-2">Confidence</div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${report.confidence}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    The model estimates a <strong>{Math.round(report.confidence)}%</strong> probability for the selected label.
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => handleDownloadPDF()}
                    disabled={exporting}
                    className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {exporting ? "Exporting..." : "Download Report (PDF)"}
                  </button>

                  <button
                    onClick={handleDownloadJSON}
                    className="w-full px-3 py-2 rounded-md border text-sm hover:bg-slate-50"
                  >
                    Export JSON
                  </button>

                  <button
                    onClick={() => alert("Re-run analysis (mock)")}
                    className="w-full px-3 py-2 rounded-md bg-yellow-100 text-sm"
                  >
                    Re-run analysis
                  </button>
                </div>
              </div>

              {/* Related / history */}
              <div className="mt-4 bg-white rounded-lg border p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-slate-800">Related Reports</h4>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {report.related.map((r) => (
                    <li key={r.id} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{r.id}</div>
                        <div className="text-xs text-slate-500">{r.date} • {r.summary}</div>
                      </div>
                      <Link to={`/results/${r.id}`} className="text-sm text-blue-600 hover:underline">
                        View
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 text-xs text-slate-500">
                <div><strong>Model version:</strong> v3.2.1</div>
                <div className="mt-1"><strong>Run ID:</strong> {report.id}-run</div>
              </div>
            </aside>
          </div>
        </section>

        {/* Right column: quick actions & metadata */}
        <aside className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h4 className="text-sm font-semibold text-slate-800">Scan Metadata</h4>
            <dl className="mt-2 text-sm text-slate-600 space-y-2">
              <div>
                <dt className="font-medium text-slate-700">Modality</dt>
                <dd>MRI T1 / T2</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Slices</dt>
                <dd>42 (uploaded)</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Uploaded</dt>
                <dd>{new Date(report.date).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h4 className="text-sm font-semibold text-slate-800">Quick Actions</h4>
            <div className="mt-3 flex flex-col gap-2">
              <Link to={`/patients/${report.patient.patientId}`} className="text-sm px-3 py-2 rounded-md border hover:bg-slate-50 text-center">
                View Patient Profile
              </Link>
              <button onClick={() => alert("Flag for review (mock)")} className="text-sm px-3 py-2 rounded-md bg-red-600 text-white">
                Flag for review
              </button>
              <button onClick={() => alert("Create follow-up reminder (mock)")} className="text-sm px-3 py-2 rounded-md border">
                Create follow-up
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h4 className="text-sm font-semibold text-slate-800">Notes</h4>
            <textarea placeholder="Add private notes for this case..." rows={4} className="w-full mt-2 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"></textarea>
            <div className="mt-3">
              <button onClick={() => alert("Save note (mock)")} className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm">Save</button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
