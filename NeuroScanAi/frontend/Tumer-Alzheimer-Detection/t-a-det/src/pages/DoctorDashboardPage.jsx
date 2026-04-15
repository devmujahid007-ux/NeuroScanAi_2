import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import {
  MRI_MODALITIES,
  absoluteUrl,
  downloadPatientScanBlob,
  fetchMriPreviewBlob,
  getDoctorRequests,
  getMriPreviewMeta,
  me,
  predictTumorSegmentation,
  runAnalysis,
  sendReport,
} from "../api";

const StatCard = ({ title, value, subtitle, icon }) => (
  <div className="bg-white rounded-2xl shadow-sm p-4 flex items-start gap-4">
    <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
      {icon}
    </div>
    <div className="flex-1">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
    </div>
  </div>
);

function MriViewerModal({ scanId, fileLabel, onClose }) {
  const [meta, setMeta] = useState(null);
  const [slice, setSlice] = useState(0);
  const [imgSrc, setImgSrc] = useState(null);
  const [err, setErr] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingImg, setLoadingImg] = useState(false);
  const urlRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingMeta(true);
    setErr(null);
    (async () => {
      try {
        const m = await getMriPreviewMeta(scanId);
        if (cancelled) return;
        setMeta(m);
        const def = typeof m.default_slice === "number" ? m.default_slice : Math.floor((m.depth || 1) / 2);
        setSlice(Math.min(def, Math.max(0, (m.depth || 1) - 1)));
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load scan metadata");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  useEffect(() => {
    if (!meta) return undefined;
    let cancelled = false;
    setLoadingImg(true);
    (async () => {
      try {
        const blob = await fetchMriPreviewBlob(scanId, slice);
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setImgSrc(urlRef.current);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load slice");
      } finally {
        if (!cancelled) setLoadingImg(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scanId, slice, meta]);

  useEffect(
    () => () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const depth = meta?.depth ?? 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mri-viewer-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-900 text-white">
          <div>
            <h2 id="mri-viewer-title" className="text-lg font-semibold">
              MRI viewer
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 font-mono">
              Scan #{scanId} · {fileLabel || "volume"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 text-white"
          >
            Close
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto bg-slate-950">
          {loadingMeta && <p className="text-slate-400 text-center py-16">Loading volume…</p>}
          {err && !loadingMeta && (
            <p className="text-red-300 text-center py-16 text-sm px-4">{err}</p>
          )}
          {!loadingMeta && meta && !err && (
            <>
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-4 px-1">
                <label className="text-sm text-slate-300 flex-1 flex flex-col gap-2">
                  <span className="text-slate-400">Axial slice ({depth} total)</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, depth - 1)}
                    value={slice}
                    onChange={(e) => setSlice(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </label>
                <div className="text-sm text-slate-400 tabular-nums">
                  Slice <span className="text-white font-medium">{slice}</span> / {Math.max(0, depth - 1)}
                  {loadingImg && <span className="ml-2 text-blue-400">Loading…</span>}
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-slate-700 bg-black flex items-center justify-center min-h-[280px]">
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt={`MRI axial slice ${slice}`}
                    className="max-w-full max-h-[70vh] object-contain"
                  />
                ) : (
                  !loadingImg && <p className="text-slate-500 p-8">No image</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function diagnosisProbsEntries(diagnosis) {
  const raw = diagnosis?.model_probs;
  if (!raw || typeof raw !== "object") return [];
  const probs = raw.probs && typeof raw.probs === "object" ? raw.probs : raw;
  return Object.entries(probs);
}

function isValidMRIFile(file) {
  if (!file) return false;
  const ALLOWED_EXT = [".dcm", ".dicom", ".nii", ".nii.gz"];
  const ALLOWED_MIME = ["application/dicom", "application/octet-stream"];
  const name = (file.name || "").toLowerCase();
  for (const ext of ALLOWED_EXT) {
    if (name.endsWith(ext)) return true;
  }
  if (file.type && ALLOWED_MIME.includes(file.type)) return true;
  return false;
}

export default function DoctorDashboardPage() {
  const [requests, setRequests] = useState([]);
  const [currentDoctor, setCurrentDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyzingScans, setAnalyzingScans] = useState(new Set());
  const [sendingReports, setSendingReports] = useState(new Set());
  const [showUploadSection, setShowUploadSection] = useState(true);
  const [uploadFiles, setUploadFiles] = useState({ t1c: null, t1n: null, t2f: null, t2w: null });
  const [uploadNotice, setUploadNotice] = useState(null);
  const [mriViewer, setMriViewer] = useState(null);
  const [workflowScanId, setWorkflowScanId] = useState("");
  const [modelView, setModelView] = useState(null);
  const [resultImageTs, setResultImageTs] = useState(0);
  const [viewBusy, setViewBusy] = useState(false);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const [doctorData, requestsData] = await Promise.all([me(), getDoctorRequests()]);
      setCurrentDoctor(doctorData);
      setRequests(requestsData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  const handleSendReport = async (scanId) => {
    try {
      setSendingReports((prev) => new Set(prev).add(scanId));
      setError(null);
      await sendReport(scanId);
      await loadRequests();
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingReports((prev) => {
        const next = new Set(prev);
        next.delete(scanId);
        return next;
      });
    }
  };

  const closeMriViewer = useCallback(() => setMriViewer(null), []);

  const pendingRequests = requests.filter((request) => request.status === "sent");
  const analyzedRequests = requests.filter((request) => request.status === "analyzed");
  const reportedRequests = requests.filter((request) => request.status === "reported");

  useEffect(() => {
    if (!workflowScanId && pendingRequests.length > 0) {
      setWorkflowScanId(String(pendingRequests[0].id));
    }
  }, [pendingRequests, workflowScanId]);

  const selectedWorkflowRequest = pendingRequests.find((r) => String(r.id) === workflowScanId);

  const handleDownloadMri = async () => {
    if (!workflowScanId) {
      setError("Select a patient scan first.");
      return;
    }
    try {
      setError(null);
      const { blob, filename } = await downloadPatientScanBlob(Number(workflowScanId));
      const name = selectedWorkflowRequest?.file_name || filename;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setUploadNotice(`Download started: ${name}. You can re-upload it below after local review.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePredict = async () => {
    setViewBusy(true);
    setError(null);
    setUploadNotice(null);
    setModelView(null);

    const t1c = uploadFiles.t1c;
    const t1n = uploadFiles.t1n;
    const t2f = uploadFiles.t2f;
    const t2w = uploadFiles.t2w;

    try {
      if (!t1c || !t1n || !t2f || !t2w) {
        setError("Please upload all 4 MRI scans");
        return;
      }

      const data = await predictTumorSegmentation({ t1c, t1n, t2f, t2w });
      setModelView({
        prediction: data?.message || "Prediction completed",
        confidence: data?.confidence ?? null,
        probs: data?.probs || null,
        tumor_volume: data?.tumor_volume || null,
        output_image_url: data?.output_image || data?.output_image_url || null,
      });
      setResultImageTs(Date.now());
      setUploadFiles({ t1c: null, t1n: null, t2f: null, t2w: null });
      for (const modality of MRI_MODALITIES) {
        const input = document.getElementById(`doctor-mri-input-${modality}`);
        if (input) input.value = "";
      }
    } catch (err) {
      setError(err.message || "Failed to connect to backend");
      setModelView(null);
    } finally {
      setViewBusy(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!workflowScanId) {
      setError("Select which patient scan you are working on.");
      return;
    }
    const id = Number(workflowScanId);
    try {
      setAnalyzingScans((prev) => new Set(prev).add(id));
      setError(null);
      await runAnalysis(id);
      setModelView(null);
      await loadRequests();
      setUploadNotice("Clinical report generated. Find this case under Analyzed — then send the report only to the patient.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzingScans((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const onUploadPick = (modality, picked) => {
    if (!picked) return;
    if (!isValidMRIFile(picked)) {
      setUploadFiles((prev) => ({ ...prev, [modality]: null }));
      setUploadNotice("Unsupported format. Use DICOM (.dcm, .dicom) or NIfTI (.nii, .nii.gz).");
      return;
    }
    setUploadFiles((prev) => ({ ...prev, [modality]: picked }));
    setUploadNotice(null);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading doctor dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-8 px-4 md:px-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-800">Doctor Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Download patient MRIs, optionally re-upload from your PC, run the tumor model, generate a report, and send only that report to the patient.
          </p>
          {currentDoctor && (
            <p className="text-xs text-slate-400 mt-1">
              Logged in as {currentDoctor.email} (Doctor ID {currentDoctor.id})
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowUploadSection((v) => !v)}
            className={`px-4 py-2 rounded-lg font-medium ${
              showUploadSection
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-blue-600 text-blue-600 hover:bg-blue-50"
            }`}
          >
            {showUploadSection ? "Hide upload" : "Upload MRI"}
          </button>
          <button
            type="button"
            onClick={loadRequests}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
          <LogoutButton />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Open Requests"
          value={pendingRequests.length}
          subtitle="Sent to you by patients"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          title="Analyzed"
          value={analyzedRequests.length}
          subtitle="Ready to send"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" /></svg>}
        />
        <StatCard
          title="Reports Sent"
          value={reportedRequests.length}
          subtitle="Delivered to patients"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 19l9 2-9-18-9 18 9-2m0 0v-8m0 8l-6-4m6 4l6-4" /></svg>}
        />
        <StatCard
          title="Total Cases"
          value={requests.length}
          subtitle="All assigned MRI scans"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10h.01M13 16h2v2l-1 1h-1l-1-1v-2zm-4-4h2v2H9v-2zm0 4h2v2H9v-2z" /></svg>}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          {error}
        </div>
      )}

      {showUploadSection && (
        <section className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200 ring-1 ring-slate-100">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">MRI — view model output &amp; report</h2>

          <div className="grid gap-4 md:grid-cols-2 mb-5">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Patient scan (open request)</label>
              <select
                value={workflowScanId}
                onChange={(e) => {
                  setWorkflowScanId(e.target.value);
                  setModelView(null);
                }}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {pendingRequests.length === 0 ? (
                  <option value="">No open requests</option>
                ) : (
                  pendingRequests.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      Scan #{r.id} — {r.patient?.email || "Patient"} — {r.file_name || "MRI"}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleDownloadMri}
                disabled={!workflowScanId || pendingRequests.length === 0}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download MRI to this PC
              </button>
            </div>
          </div>

          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50"
          >
            <p className="text-sm font-medium text-slate-700 mb-1">Re-upload MRI from this PC (optional)</p>
            <p className="text-xs text-slate-500 mb-3">
              DICOM (<span className="font-mono">.dcm</span>, <span className="font-mono">.dicom</span>) or NIfTI (<span className="font-mono">.nii</span>, <span className="font-mono">.nii.gz</span>).
              If you choose a file, it replaces the scan on the server when you click <strong>View result</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {MRI_MODALITIES.map((modality) => (
                <div key={modality} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">{modality}</div>
                  <div className="text-xs text-slate-500 mb-2 break-all">
                    {uploadFiles[modality] ? uploadFiles[modality].name : "No file selected"}
                  </div>
                  <div className="flex items-center gap-3">
                    <label
                      htmlFor={`doctor-mri-input-${modality}`}
                      className="text-blue-600 font-semibold cursor-pointer hover:underline text-sm"
                    >
                      Choose file
                    </label>
                    <input
                      id={`doctor-mri-input-${modality}`}
                      type="file"
                      accept=".dcm,.dicom,.nii,.nii.gz"
                      className="hidden"
                      onChange={(e) => onUploadPick(modality, e.target.files?.[0])}
                    />
                    {uploadFiles[modality] && (
                      <button
                        type="button"
                        className="text-sm text-slate-500 underline"
                        onClick={() => {
                          setUploadFiles((prev) => ({ ...prev, [modality]: null }));
                          setUploadNotice(null);
                          const input = document.getElementById(`doctor-mri-input-${modality}`);
                          if (input) input.value = "";
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePredict}
              disabled={viewBusy}
              className="flex-1 min-w-[160px] px-4 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {viewBusy ? "Running model…" : "View result"}
            </button>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={
                !workflowScanId ||
                pendingRequests.length === 0 ||
                analyzingScans.has(Number(workflowScanId))
              }
              className="flex-1 min-w-[160px] px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {analyzingScans.has(Number(workflowScanId)) ? "Generating…" : "Generate report"}
            </button>
          </div>

          {uploadNotice && <p className="mt-4 text-sm text-slate-600">{uploadNotice}</p>}

          {modelView && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-6">
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 rounded-lg overflow-hidden border border-slate-200 bg-black shadow-inner">
                  <img
                    src={`${absoluteUrl(modelView.output_image_url)}?t=${resultImageTs}`}
                    alt="Model output slice"
                    className="w-full max-h-[420px] object-contain mx-auto"
                  />
                </div>
                <div className="flex-1 space-y-4 text-sm">
                  <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-2 font-mono text-slate-900">
                    <div>
                      <span className="text-slate-500 font-sans text-xs uppercase tracking-wide">Prediction</span>
                      <div className="text-lg font-semibold">{modelView.prediction}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-sans text-xs uppercase tracking-wide">Confidence</span>
                      <div>{modelView.confidence != null ? `${modelView.confidence}%` : "N/A"}</div>
                    </div>
                    {modelView.tumor_volume && (
                      <div>
                        <span className="text-slate-500 font-sans text-xs uppercase tracking-wide">Tumor Volume</span>
                        <div>{modelView.tumor_volume}</div>
                      </div>
                    )}
                    {modelView.model_version && (
                      <div className="text-xs text-slate-500 font-sans pt-1">{modelView.model_version}</div>
                    )}
                  </div>
                  {modelView.probs && (
                    <div className="bg-white rounded-lg p-4 border border-slate-200 font-mono text-sm">
                      {Object.entries(modelView.probs).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4 py-1 border-b border-slate-100 last:border-0">
                          <span className="text-slate-700">{k}</span>
                          <span>{v}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="space-y-6 scroll-mt-24">
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Open Requests</h2>
            <span className="text-sm text-slate-500">{pendingRequests.length} waiting</span>
          </div>

          {pendingRequests.length === 0 ? (
            <p className="text-slate-500">
              No open requests right now. If a patient already sent an MRI, confirm they chose your doctor ID and email from
              their dashboard; mismatched accounts will not show the same queue.
            </p>
          ) : (
            <div className="space-y-4">
              {pendingRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-slate-600">Scan ID {request.scan_id ?? request.id}</div>
                      <div className="text-sm font-semibold text-slate-800">{request.file_name || `File #${request.id}`}</div>
                      <div className="text-xs text-slate-500 mt-1">Patient: {request.patient?.name || request.patient?.email || `Patient #${request.patient_id}`}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Uploaded: {request.upload_date ? new Date(request.upload_date).toLocaleString() : "Unknown"}
                        {request.sent_date ? (
                          <span className="ml-2">· Sent to you: {new Date(request.sent_date).toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-800 font-medium text-xs">
                      {request.status}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-sm text-slate-700">
                    <div className="bg-slate-50 rounded p-3">
                      <strong>Patient Email:</strong> {request.patient?.email || "N/A"}
                    </div>
                    <div className="bg-slate-50 rounded p-3">
                      <strong>Patient Age:</strong> {request.patient?.age ?? "N/A"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setMriViewer({ id: request.id, label: request.file_name || `scan-${request.id}` })}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
                    >
                      Open MRI Scan
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWorkflowScanId(String(request.id));
                        setShowUploadSection(true);
                        setModelView(null);
                      }}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-white font-medium hover:bg-slate-900"
                    >
                      Use in Upload MRI workflow
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Analyzed Cases</h2>
            <span className="text-sm text-slate-500">{analyzedRequests.length} ready</span>
          </div>

          {analyzedRequests.length === 0 ? (
            <p className="text-slate-500">No analyzed cases waiting to be sent.</p>
          ) : (
            <div className="space-y-4">
              {analyzedRequests.map((request) => (
                <div key={request.id} className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-slate-600">Scan ID {request.scan_id ?? request.id}</div>
                      <div className="text-sm font-semibold text-slate-800">{request.file_name || `File #${request.id}`}</div>
                      <div className="text-xs text-slate-500 mt-1">Patient: {request.patient?.name || request.patient?.email || `Patient #${request.patient_id}`}</div>
                    </div>
                    <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-800 font-medium text-xs">{request.status}</span>
                  </div>

                  <div className="bg-white rounded p-3 text-sm space-y-2">
                    <div><strong>Prediction:</strong> {request.diagnosis?.prediction || "N/A"}</div>
                    <div><strong>Confidence:</strong> {request.diagnosis?.confidence ? `${request.diagnosis.confidence}%` : "N/A"}</div>
                    <div><strong>Model:</strong> {request.diagnosis?.model_version || "N/A"}</div>
                    {diagnosisProbsEntries(request.diagnosis).length > 0 && (
                      <div className="text-xs font-mono bg-slate-50 rounded p-2 border border-slate-100 space-y-0.5">
                        {diagnosisProbsEntries(request.diagnosis).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span>{k}</span>
                            <span>{v}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div><strong>Summary:</strong> {request.diagnosis?.report?.summary || "Not generated"}</div>
                    <div className="whitespace-pre-line"><strong>Recommendation:</strong> {`\n${request.diagnosis?.report?.recommendation || "Not generated"}`}</div>
                  </div>

                  <div className="grid md:grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setMriViewer({ id: request.id, label: request.file_name || `scan-${request.id}` })}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-center font-medium"
                    >
                      View MRI
                    </button>
                    {request.diagnosis?.report?.id ? (
                      <Link
                        to={`/results/${request.diagnosis.report.id}`}
                        className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 text-center"
                      >
                        Open Result
                      </Link>
                    ) : (
                      <div className="px-4 py-2 rounded-lg border border-slate-200 text-slate-400 text-center">
                        Result not available
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSendReport(request.id)}
                      disabled={sendingReports.has(request.id)}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingReports.has(request.id) ? "Sending…" : "Send report only to patient"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Reports Sent</h2>
            <span className="text-sm text-slate-500">{reportedRequests.length} completed</span>
          </div>

          {reportedRequests.length === 0 ? (
            <p className="text-slate-500">No reports have been sent yet.</p>
          ) : (
            <div className="space-y-3">
              {reportedRequests.map((request) => (
                <div key={request.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-xs font-mono text-slate-500">Scan ID {request.scan_id ?? request.id}</div>
                    <div className="text-sm font-medium text-slate-800">{request.file_name || `File #${request.id}`}</div>
                    <div className="text-xs text-slate-500 mt-1">Patient: {request.patient?.name || request.patient?.email || `Patient #${request.patient_id}`}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMriViewer({ id: request.id, label: request.file_name || `scan-${request.id}` })}
                      className="px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-sm"
                    >
                      View MRI
                    </button>
                    {request.diagnosis?.report?.download_url && (
                      <a
                        href={absoluteUrl(request.diagnosis.report.download_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-md border border-slate-300 hover:bg-slate-50 text-sm"
                      >
                        Download Report
                      </a>
                    )}
                    {request.diagnosis?.report?.id && (
                      <Link
                        to={`/results/${request.diagnosis.report.id}`}
                        className="px-3 py-2 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50 text-sm"
                      >
                        View Result
                      </Link>
                    )}
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Reported
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {mriViewer && (
        <MriViewerModal scanId={mriViewer.id} fileLabel={mriViewer.label} onClose={closeMriViewer} />
      )}
    </div>
  );
}
