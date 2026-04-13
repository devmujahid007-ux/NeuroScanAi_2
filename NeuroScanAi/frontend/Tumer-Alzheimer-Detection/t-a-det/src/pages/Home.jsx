import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";

import logo from "../assests/logo.png";
import heroMRI from "../assests/heroMRI.jpg";
import sample1 from "../assests/sample1.png";
import { getRecentAnalyses, streamAnalyses, BASE_URL } from "../api";

/** Feature card */
const Feature = ({ title, desc, icon }) => (
  <div className="bg-white rounded-2xl shadow-sm p-5 flex gap-4 items-start">
    <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
      {icon}
    </div>
    <div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <p className="text-sm text-slate-500 mt-1">{desc}</p>
    </div>
  </div>
);

/** Safely parse JSON only if Content-Type is JSON */
async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function Home() {
  /** ---------- STATE ---------- **/
  const [howItWorksSteps, setHowItWorksSteps] = useState([
    { step: 1, title: "Upload MRI", desc: "Add DICOM/NIfTI or images for analysis." },
    { step: 2, title: "AI Analysis", desc: "Our models scan for tumor/Alzheimer’s patterns." },
    { step: 3, title: "Review & Export", desc: "See confidence scores and export a PDF report." },
  ]);
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [exampleOutcome, setExampleOutcome] = useState({
    heading: "Example Outcome",
    title: "Example Model Outcome",
    confidenceText: "Confidence: --",
    note: "Live results shown below when available.",
  });

  const [loadingRecent, setLoadingRecent] = useState(true);
  const [errorRecent, setErrorRecent] = useState(null);

  const pollTimerRef = useRef(null);

  /** ---------- HELPERS ---------- **/
  const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const firstAnalysis = useMemo(() => recentAnalyses?.[0], [recentAnalyses]);

  /** ---------- FETCH (LIVE) ---------- **/
  useEffect(() => {
    let cancelled = false;
    let es;

    async function loadRecent() {
      try {
        const data = await getRecentAnalyses(6);
        if (!cancelled) {
          setRecentAnalyses(data || []);
          setLoadingRecent(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorRecent("Failed to load recent analyses. Start by uploading a scan.");
          setLoadingRecent(false);
        }
      }
    }

    // Initial load
    loadRecent();

    // SSE live updates
    if (typeof window !== "undefined") {
      try {
        es = streamAnalyses((payload) => {
          try {
            if (payload?.type === "analysis.created" && payload.analysis) {
              setRecentAnalyses((prev) => {
                const next = [payload.analysis, ...prev];
                const seen = new Set();
                const deduped = next.filter((a) => {
                  if (!a?.id) return false;
                  if (seen.has(a.id)) return false;
                  seen.add(a.id);
                  return true;
                });
                return deduped.slice(0, 6);
              });
            }
          } catch {}
        });
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    function startPolling() {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(loadRecent, 20000); // 20s
    }

    return () => {
      cancelled = true;
      try { es && es.close(); } catch {}
      clearInterval(pollTimerRef.current);
    };
  }, []);

  /** ---------- OPTIONAL: Try to hydrate meta from /data/Home.json safely ---------- **/
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/data/Home.json");
        const json = await safeJson(res);
        if (!ignore && json) {
          if (Array.isArray(json.howItWorksSteps)) {
            setHowItWorksSteps(json.howItWorksSteps);
          }
          if (json.exampleOutcome && typeof json.exampleOutcome === "object") {
            setExampleOutcome(json.exampleOutcome);
          }
        }
      } catch {
        // silently keep mocks
      }
    })();
    return () => { ignore = true; };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pt-10">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <img src={logo} alt="NeuroScan AI" className="w-12 h-12 object-contain" />
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">NeuroScan AI</h1>
                <p className="text-xs text-slate-500 -mt-1">Brain Tumor & Alzheimer’s Detection</p>
              </div>
            </div>

            <h2 className="text-3xl md:text-4xl leading-tight font-bold text-slate-900">
              Early, accurate MRI-based detection for Brain Tumor & Alzheimer’s
            </h2>

            <p className="text-slate-600 max-w-xl">
              Upload MRI scans, get AI-powered analyses with confidence scores, and export professional reports for clinicians and patients.
              Built for research labs and clinical workflows.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <Link
                to="/about"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
              >
                Learn More
              </Link>
            </div>

            <div className="mt-4 text-sm text-slate-500">
              <strong className="text-slate-800">For clinicians:</strong> HIPAA-ready architecture coming soon — contact us for early access.
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <img src={heroMRI} alt="MRI scan sample" className="w-full h-72 object-cover md:h-96" />
            </div>

            {/* Floating card (dynamic Recent Analysis) */}
            {firstAnalysis && (
              <div className="absolute -bottom-6 right-6 bg-white rounded-xl shadow-md px-4 py-3 w-64">
                <div className="flex items-center gap-3">
                  <img src={(firstAnalysis?.image && firstAnalysis.image.startsWith("http")) ? firstAnalysis.image : (firstAnalysis?.image ? (BASE_URL + firstAnalysis.image) : sample1)} alt="sample" className="w-12 h-12 rounded-md object-cover" />
                  <div>
                    <div className="text-sm font-medium text-slate-800">Recent analysis</div>
                    <div className="text-xs text-slate-500">
                      {firstAnalysis.prediction} — {clampPct(firstAnalysis.confidence)}% confidence
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-20">
        <h3 className="text-xl font-semibold text-slate-900 mb-6">Why NeuroScan AI</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Feature
            title="AI-driven Diagnosis"
            desc="State-of-the-art convolutional models trained on MRI datasets to detect lesions and patterns."
            icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 3v18M3 12h18"/></svg>}
          />
          <Feature
            title="Secure & Compliant"
            desc="Design-forward architecture with patient privacy and secure uploads (encryption-ready)."
            icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 11V7a4 4 0 114 4h-4zM5 12v6a3 3 0 003 3h8a3 3 0 003-3v-6"/></svg>}
          />
          <Feature
            title="Clinician Reports"
            desc="Downloadable PDF reports with images, predictions, and AI confidence intervals — ready for EHR upload."
            icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-6l6-3v6l-6 3zM21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6"/></svg>}
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16">
        <h3 className="text-xl font-semibold text-slate-900 mb-6">How it works</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {howItWorksSteps.map(({ step, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl shadow-sm p-6">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <span className="font-semibold text-blue-600">{step}</span>
              </div>
              <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
              <p className="text-sm text-slate-500 mt-2">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent results (LIVE with safe fallback) */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-slate-900">Recent Analyses</h3>
          <Link to="/results" className="text-sm text-blue-600 font-medium hover:underline">View all</Link>
        </div>

        {loadingRecent && <div className="mt-6 text-sm text-slate-500">Loading recent analyses…</div>}
        {!loadingRecent && errorRecent && (
          <div className="mt-6 text-sm text-red-600">Error loading live data. Showing sample results.</div>
        )}
        {!loadingRecent && !errorRecent && recentAnalyses.length === 0 && (
          <div className="mt-6 text-sm text-slate-500">No analyses yet. Run your first analysis to see it here.</div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {recentAnalyses.map((r) => (
            <article key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="h-44 rounded-md overflow-hidden">
                <img
                  src={(r.image && r.image.startsWith("http")) ? r.image : (r.image ? (BASE_URL + r.image) : sample1)}
                  alt={`Sample result ${r.id}`}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800">{r.patientLabel || "MRI Study"}</h4>
                  <span className="text-xs text-slate-500">{r.timeLabel || "Just now"}</span>
                </div>

                <p className="text-sm text-slate-500 mt-2">
                  Prediction: <strong className="text-slate-800">{r.prediction}</strong>
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <div className="text-xs text-slate-500">Confidence</div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${clampPct(r.confidence)}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-700 w-10 text-right">
                    {clampPct(r.confidence)}%
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <Link to={r.viewUrl || `/results/${r.id}`} className="text-xs px-3 py-2 rounded-md border text-slate-700 hover:bg-slate-50">View</Link>
                  <Link to={r.downloadUrl || `/results/${r.id}/download`} className="text-xs px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Download</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Example Outcome */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16 mb-20">
        <div className="grid md:grid-cols-2 gap-8 items-center bg-white rounded-2xl shadow-sm p-6">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">Trusted by researchers</h3>
            <p className="text-sm text-slate-500 mt-3">
              NeuroScan AI is built on peer-reviewed research and emphasizes transparency: every prediction includes a confidence score and visual explainability maps.
            </p>

            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>• Explainability maps (Grad-CAM) for clinician review</li>
              <li>• Exportable PDF & CSV reports</li>
              <li>• API-first design for lab integrations</li>
            </ul>

            <div className="mt-6 flex gap-3">
              <Link to="/resources/papers" className="text-sm px-4 py-2 rounded-md border hover:bg-slate-50">Read papers</Link>
              <Link to="/contact" className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Contact us</Link>
            </div>
          </div>

          {exampleOutcome && (
            <div className="flex flex-col gap-3">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl p-6 shadow-md">
                <div className="text-sm font-semibold">{exampleOutcome.heading}</div>
                <div className="mt-3 text-2xl font-bold">
                  {exampleOutcome.title} — {exampleOutcome.confidenceText}
                </div>
                <div className="mt-2 text-xs text-blue-100">{exampleOutcome.note}</div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4">
                <div className="text-sm text-slate-700">Supported formats</div>
                <div className="mt-2 text-xs text-slate-500">DICOM, NIfTI, PNG, JPEG</div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
