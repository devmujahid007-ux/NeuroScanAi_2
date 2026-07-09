import React, { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";

import heroMRI from "../assests/heroMRI.jpg";
import { getRecentAnalyses, streamAnalyses, absoluteUrl } from "../api";

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

export default function Home() {
  /** ---------- STATE ---------- **/
  const [howItWorksSteps] = useState([
    {
      step: 1,
      title: "Patient Upload (ZIP MRI)",
      desc: "Patient uploads MRI ZIP and assigns a doctor; scan appears in doctor workflow.",
    },
    {
      step: 2,
      title: "Doctor Analysis + Report",
      desc: "Doctor reviews scan, runs analysis, and generates the report PDF on the server.",
    },
    {
      step: 3,
      title: "Send + Patient Download",
      desc: "Doctor sends report to patient dashboard, and patient downloads the final PDF.",
    },
  ]);
  const [recentAnalyses, setRecentAnalyses] = useState([]);

  const [loadingRecent, setLoadingRecent] = useState(true);
  const [errorRecent, setErrorRecent] = useState(null);

  const pollTimerRef = useRef(null);

  /** ---------- HELPERS ---------- **/
  const clampPct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
  const normalizeConfidencePct = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num <= 1) return clampPct(num * 100);
    return clampPct(num);
  };
  const firstAnalysis = useMemo(() => recentAnalyses?.[0], [recentAnalyses]);
  const recentAnalysisCards = useMemo(
    () =>
      (recentAnalyses || []).map((row) => {
        const dateRaw = row?.analyzed_at || row?.date;
        const dateObj = dateRaw ? new Date(dateRaw) : null;
        const dateLabel =
          dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : "Recent";
        const reportMatch =
          typeof row?.reportDownloadUrl === "string" ? row.reportDownloadUrl.match(/\/reports\/(\d+)/) : null;
        const reportIdFromApi = reportMatch ? reportMatch[1] : null;
        const rawId = row?.id;
        const numericReportId =
          typeof rawId === "number"
            ? String(rawId)
            : typeof rawId === "string" && /^\d+$/.test(rawId)
              ? rawId
              : null;
        const viewUrl =
          reportIdFromApi != null
            ? `/results/${reportIdFromApi}`
            : numericReportId != null
              ? `/results/${numericReportId}`
              : "/login";
        const previewSrc = absoluteUrl(row?.imageUrl);
        return {
          id: row?.diagnosis_id ?? row?.id ?? rawId,
          prediction: row?.prediction || row?.label || "Pending",
          confidence: normalizeConfidencePct(row?.confidence),
          patientLabel: row?.patient?.name || row?.patient?.email || `Case #${row?.scan_id ?? row?.id}`,
          timeLabel: dateLabel,
          imageUrl: previewSrc,
          viewUrl,
        };
      }),
    [recentAnalyses]
  );
  const platformHighlights = useMemo(
    () => [
      "Role-based dashboards for patients, doctors, and administrators",
      "Report lifecycle from scan upload to doctor delivery to patient download",
      "Secure APIs with JWT authentication and audit-friendly data flows",
    ],
    []
  );

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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      <section className="max-w-7xl mx-auto px-6 md:px-10 pt-8 md:pt-12">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
                Clinical-ready MRI workflow for Brain Tumor and Alzheimer&apos;s reporting
              </h1>
              <p className="mt-4 text-slate-600 max-w-2xl">
                From patient uploads to doctor review and PDF delivery, NeuroScan provides a single workflow for analysis,
                reporting, and secure handoff between care teams and patients.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link to="/login" className="px-5 py-3 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                Open Platform
              </Link>
            </div>

            <ul className="space-y-2 text-sm text-slate-600">
              {platformHighlights.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200">
              <img src={heroMRI} alt="MRI clinical dashboard preview" className="w-full h-80 md:h-[430px] object-cover" />
            </div>
            {firstAnalysis && (
              <div className="absolute -bottom-5 right-5 bg-white rounded-xl shadow-md px-4 py-3 w-64 border border-slate-100">
                <div className="text-xs text-slate-500">Latest analysis</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">
                  {firstAnalysis.prediction || "Prediction available"}
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Confidence:{" "}
                  {firstAnalysis.confidence != null
                    ? `${normalizeConfidencePct(firstAnalysis.confidence)?.toFixed(2) ?? "—"}%`
                    : "—"}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">Core Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Feature
            title="Patient-to-Doctor Intake"
            desc="Patients upload ZIP MRI studies and assign doctors directly, preventing unassigned cases."
            icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 14v7m0-7l-3 3m3-3l3 3M5 10a4 4 0 01.88-7.903A5 5 0 0115.9 4L16 4a5 5 0 011 9.9" /></svg>}
          />
          <Feature
            title="Doctor Review and Reporting"
            desc="Doctors process scans, generate report PDFs, and send finalized reports to patient dashboards."
            icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586A1 1 0 0113.293 3.293l4.414 4.414A1 1 0 0118 8.414V19a2 2 0 01-2 2z" /></svg>}
          />
          <Feature
            title="Admin Operations"
            desc="Admins manage doctor/patient accounts, monitor platform usage, and maintain clean user lists."
            icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10h.01M13 16h2v2l-1 1h-1l-1-1v-2zm-4-4h2v2H9v-2z" /></svg>}
          />
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16">
        <h2 className="text-2xl font-semibold text-slate-900 mb-6">How The Workflow Runs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {howItWorksSteps.map(({ step, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl shadow-sm p-6 border border-slate-100">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-4 text-blue-600 font-semibold">
                {step}
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
              <p className="text-sm text-slate-600 mt-2">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-slate-900">Recent Analyses</h2>
          <Link to="/login" className="text-sm text-blue-600 font-medium hover:underline">Sign in to view dashboards</Link>
        </div>

        {loadingRecent && <div className="mt-6 text-sm text-slate-500">Loading recent analyses...</div>}
        {!loadingRecent && errorRecent && (
          <div className="mt-6 text-sm text-red-600">Live feed unavailable right now. Upload a scan to generate new entries.</div>
        )}
        {!loadingRecent && !errorRecent && recentAnalyses.length === 0 && (
          <div className="mt-6 text-sm text-slate-500">No analyses yet. Your first completed case will appear here.</div>
        )}

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {recentAnalysisCards.map((r) => (
            <article key={r.id} className="bg-white rounded-2xl shadow-sm p-4 border border-slate-100">
              <div className="h-44 rounded-md overflow-hidden">
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt={`Analysis ${r.id}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                    No preview image available
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800">{r.patientLabel || `Case #${r.id}`}</h4>
                  <span className="text-xs text-slate-500">{r.timeLabel || "Recent"}</span>
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Prediction: <span className="font-semibold text-slate-800">{r.prediction || "Pending"}</span>
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="text-xs text-slate-500">Confidence</div>
                  {r.confidence != null ? (
                    <>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${r.confidence}%` }} />
                      </div>
                      <div className="text-xs text-slate-700 w-12 text-right">{r.confidence.toFixed(2)}%</div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-600">N/A</div>
                  )}
                </div>
                <div className="mt-4">
                  <Link to={r.viewUrl} className="text-xs px-3 py-2 rounded-md border text-slate-700 hover:bg-slate-50">
                    View case
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 md:px-10 mt-16 mb-20">
        <div className="grid md:grid-cols-2 gap-8 items-center bg-white rounded-2xl shadow-sm p-6 border border-slate-100">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Built for real clinical handoff</h2>
            <p className="text-sm text-slate-600 mt-3">
              The project supports a complete loop: patient upload, doctor analysis, report generation, and patient
              download. Every role gets a focused dashboard aligned to daily tasks.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>- Secure login with role-based access control</li>
              <li>- Report PDF generation and controlled delivery</li>
              <li>- Centralized admin management for doctors and patients</li>
            </ul>
            <div className="mt-6 flex gap-3">
              <Link to="/login" className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700">Get Started</Link>
              <Link to="/contact" className="text-sm px-4 py-2 rounded-md border hover:bg-slate-50">Talk to Team</Link>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl p-6 shadow-md">
              <div className="text-sm font-semibold">Clinical Output</div>
              <div className="mt-3 text-2xl font-bold">
                Live analysis confidence and downloadable PDF reporting
              </div>
              <div className="mt-2 text-xs text-blue-100">
                Results on this platform come directly from completed analyses and report generation workflow.
              </div>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <div className="text-sm text-slate-700">Accepted MRI input</div>
              <div className="mt-2 text-xs text-slate-500">NIfTI (.nii/.nii.gz), DICOM, and archive-based upload workflows</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
