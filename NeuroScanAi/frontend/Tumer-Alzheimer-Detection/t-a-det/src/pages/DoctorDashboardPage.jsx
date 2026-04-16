import React, { useCallback, useEffect, useRef, useState } from "react";
import LogoutButton from "../components/LogoutButton";
import {
  MRI_MODALITIES,
  absoluteUrl,
  downloadPatientScanBlob,
  fetchMriPreviewBlob,
  generateSegmentationReport,
  getDoctorRequests,
  getMriPreviewMeta,
  listReports,
  me,
  predictTumorSegmentation,
  reportPdfOpenUrl,
  sendReportToPatient,
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
  const [reportList, setReportList] = useState([]);

  const openReportPdfDownload = useCallback((reportId) => {
    const id = Number(reportId);
    if (!id) return;
    const url = reportPdfOpenUrl(id, { download: true });
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const sendSegReportToPatient = async ({ reportId, patientId, scanId }) => {
    if (!reportId || !patientId || scanId == null) {
      setError("Missing report or patient for this scan.");
      return;
    }
    try {
      setError(null);
      setSendingReports((prev) => new Set(prev).add(scanId));
      await sendReportToPatient(reportId, patientId);
      await loadRequests({ quiet: true });
      await loadReportList();
      setUploadNotice(`Report #${reportId} was sent to the patient.`);
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

  async function loadReportList() {
    try {
      const rows = await listReports();
      setReportList(Array.isArray(rows) ? rows : []);
    } catch {
      setReportList([]);
    }
  }

  async function loadRequests(options = {}) {
    const quiet = Boolean(options.quiet);
    if (!quiet) {
      setLoading(true);
    }
    setError(null);
    try {
      const [doctorData, requestsData] = await Promise.all([me(), getDoctorRequests()]);
      setCurrentDoctor(doctorData);
      const list = requestsData || [];
      setRequests(list);
      await loadReportList();
      return list;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      if (!quiet) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  const closeMriViewer = useCallback(() => setMriViewer(null), []);

  /** Scans that can use the report workflow (stays visible after status moves to analyzed) */
  const workflowScans = requests.filter((r) => r.status === "sent" || r.status === "analyzed");
  const openRequestsCount = workflowScans.length;
  const reportsSentCount = reportList.filter((report) => Boolean(report.sent_to_patient)).length;
  const totalCasesCount = requests.length;

  useEffect(() => {
    if (workflowScans.length === 0) {
      if (workflowScanId) setWorkflowScanId("");
      return;
    }
    const stillExists = workflowScans.some((scan) => String(scan.id) === workflowScanId);
    if (!workflowScanId || !stillExists) {
      setWorkflowScanId(String(workflowScans[0].id));
    }
  }, [workflowScans, workflowScanId]);

  const selectedWorkflowScan = requests.find((r) => String(r.id) === workflowScanId);

  const handleDownloadMri = async () => {
    if (!workflowScanId) {
      setError("Select a patient scan first.");
      return;
    }
    try {
      setError(null);
      const { blob, filename } = await downloadPatientScanBlob(Number(workflowScanId));
      const name = selectedWorkflowScan?.file_name || filename;
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
        setError("Please upload all 4 MRI scans (uses the same tumor segmentation model as /predict).");
        return;
      }

      const data = await predictTumorSegmentation({ t1c, t1n, t2f, t2w });
      setModelView({
        prediction: data?.message || "Prediction completed",
        confidence: data?.confidence ?? null,
        probs: data?.probs || null,
        tumor_volume: data?.tumor_volume || null,
        output_image_url: data?.output_image || data?.output_image_url || null,
        model_version: data?.model_version || null,
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
    if (!modelView) {
      setError("Run View result (/predict) successfully first, then generate the report.");
      return;
    }
    if (!workflowScanId) {
      setError("Select which patient scan you are working on.");
      return;
    }
    const id = Number(workflowScanId);
    const req = selectedWorkflowScan;
    if (!req?.patient_id) {
      setError("Could not resolve patient for this scan.");
      return;
    }
    try {
      setAnalyzingScans((prev) => new Set(prev).add(id));
      setError(null);
      const { reportId } = await generateSegmentationReport({
        scan_id: id,
        patient_id: req.patient_id,
        patient_name: req.patient?.name || null,
        age: req.patient?.age ?? null,
      });

      const refreshed = await loadRequests({ quiet: true });
      const row = refreshed?.find((r) => r.id === id);
      const resolvedReportId =
        reportId != null && reportId !== "" ? Number(reportId) : row?.diagnosis?.report?.id ?? null;

      await loadReportList();
      if (resolvedReportId) {
        const url = reportPdfOpenUrl(resolvedReportId, { download: false });
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
      setUploadNotice(
        "Report generated successfully and saved on the server. The PDF opened in a new tab — use Reports below to view, download, or send to the patient."
      );
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
            Download patient MRIs if needed, re-upload modalities, run the model, generate a PDF report (saved automatically), then send it to the patient from Reports.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Open Requests"
          value={openRequestsCount}
          subtitle="Sent / analyzed and pending delivery"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard
          title="Reports Sent"
          value={reportsSentCount}
          subtitle="Delivered to patients"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 19l9 2-9-18-9 18 9-2m0 0v-8m0 8l-6-4m6 4l6-4" /></svg>}
        />
        <StatCard
          title="Total Cases"
          value={totalCasesCount}
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

          <div className="grid gap-4 md:grid-cols-3 mb-5">
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
                {workflowScans.length === 0 ? (
                  <option value="">No active scans (sent / analyzed)</option>
                ) : (
                  workflowScans.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      Scan #{r.id} — {r.status} — {r.patient?.email || "Patient"} — {r.file_name || "MRI"}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleDownloadMri}
                disabled={!workflowScanId || workflowScans.length === 0}
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
              <strong> View result</strong> runs the legacy <span className="font-mono">/predict</span> tumor segmentation pipeline on these four files (not the BraTS server scan path).
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
              disabled={viewBusy || MRI_MODALITIES.some((m) => !uploadFiles[m])}
              className="flex-1 min-w-[160px] px-4 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {viewBusy ? "Running model…" : "View result (/predict)"}
            </button>
            <button
              type="button"
              onClick={handleGenerateReport}
              title={
                !modelView && workflowScanId && workflowScans.length > 0
                  ? "Run View result (/predict) successfully first"
                  : undefined
              }
              disabled={
                !workflowScanId ||
                workflowScans.length === 0 ||
                !modelView ||
                analyzingScans.has(Number(workflowScanId))
              }
              className="flex-1 min-w-[160px] px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {analyzingScans.has(Number(workflowScanId)) ? "Generating…" : "Generate report (PDF)"}
            </button>
          </div>
          {!modelView && workflowScanId && workflowScans.length > 0 ? (
            <p className="text-xs text-amber-800 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Upload all four MRI files and click <strong>View result</strong> before <strong>Generate report</strong> is available.
            </p>
          ) : null}

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
                    {modelView.model_version && (
                      <div className="text-xs text-slate-500 font-sans pt-1">{modelView.model_version}</div>
                    )}
                    {modelView.tumor_volume && (
                      <div>
                        <span className="text-slate-500 font-sans text-xs uppercase tracking-wide">Tumor volume (voxel proxy)</span>
                        <div>{modelView.tumor_volume}</div>
                      </div>
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

                   <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <h3 className="text-lg font-semibold text-slate-900">Report history</h3>
              <span className="text-xs text-slate-500">{reportList.length} saved on server</span>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              PDFs are stored under <span className="font-mono text-xs">/reports</span> on the server and listed via{" "}
              <span className="font-mono text-xs">GET /reports</span>. <strong>Download</strong> saves the file. Use{" "}
              <strong>Send to patient</strong> when a report should appear on the patient dashboard.
            </p>
            {reportList.length === 0 ? (
              <p className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-4 border border-slate-100">
                No reports yet. Run <strong>View result</strong>, then <strong>Generate report</strong> — the PDF opens in a new tab and appears here.
              </p>
            ) : (
              <ul className="space-y-3">
                {reportList.map((row) => {
                  const sentToPatient = Boolean(row.sent_to_patient);
                  const patientName = row.patient_name || `Patient #${row.patient_id}`;
                  const dateLabel = row.created_at ? new Date(row.created_at).toLocaleString() : "—";
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">{patientName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Report #{row.id} · Scan #{row.scan_id} · {dateLabel}
                        </div>
                        <div className="mt-2">
                          {sentToPatient ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Sent to patient
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900">
                              Not sent yet
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openReportPdfDownload(row.id)}
                          className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50"
                        >
                          Download
                        </button>
                        {!sentToPatient ? (
                          <button
                            type="button"
                            onClick={() =>
                              sendSegReportToPatient({
                                reportId: row.id,
                                patientId: row.patient_id,
                                scanId: row.scan_id,
                              })
                            }
                            disabled={sendingReports.has(row.scan_id)}
                            className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {sendingReports.has(row.scan_id) ? "Sending…" : "Send to patient"}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {uploadNotice && <p className="mt-4 text-sm text-slate-600">{uploadNotice}</p>}

        </section>
      )}

      {mriViewer && (
        <MriViewerModal scanId={mriViewer.id} fileLabel={mriViewer.label} onClose={closeMriViewer} />
      )}
    </div>
  );
}
