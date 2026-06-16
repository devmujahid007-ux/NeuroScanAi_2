import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MRI_MODALITIES,
  absoluteUrl,
  downloadPatientScanBlob,
  fetchMriPreviewBlob,
  finalizeReportPdf,
  generateSegmentationReport,
  getDoctorRequests,
  getMriPreviewMeta,
  listReports,
  me,
  predictTumorSegmentation,
  reportPdfOpenUrl,
  sendReportToPatient,
  viewAlzheimerLocalResult,
  viewModelResult,
} from "../api";

function DoctorReportHistoryBlock({
  reportList,
  openReportPdfDownload,
  sendSegReportToPatient,
  sendingReports,
  showViewResultLink = false,
}) {
  return (
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
          No reports yet. Run <strong>View result</strong>, then <strong>Generate report</strong> — after you confirm the text and download the PDF, it appears here.
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
                  {showViewResultLink ? (
                    <Link
                      to={`/results/${row.id}`}
                      className="px-3 py-2 rounded-lg border border-blue-600 text-blue-600 text-sm font-medium hover:bg-blue-50 text-center"
                    >
                      View result summary
                    </Link>
                  ) : null}
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
  );
}

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
  /** @type {['tumor','alzheimer']} */
  const [doctorModule, setDoctorModule] = useState("tumor");
  const [currentDoctor, setCurrentDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyzingScans, setAnalyzingScans] = useState(new Set());
  const [sendingReports, setSendingReports] = useState(new Set());
  const [showUploadSection, setShowUploadSection] = useState(true);
  const [uploadFiles, setUploadFiles] = useState({ t1c: null, t1n: null, t2f: null, t2w: null });
  const [alzUploadImage, setAlzUploadImage] = useState(null);
  const [uploadNotice, setUploadNotice] = useState(null);
  const [mriViewer, setMriViewer] = useState(null);
  const [workflowScanId, setWorkflowScanId] = useState("");
  /** Scan id that has completed `viewModelResult` (stored pipeline); required before PDF. */
  const [pdfUnlockedScanId, setPdfUnlockedScanId] = useState(null);
  const [modelView, setModelView] = useState(null);
  const [resultImageTs, setResultImageTs] = useState(0);
  const [viewBusy, setViewBusy] = useState(false);
  /** Which tumor inference is running: server scan vs local four-file /predict */
  const [inferenceBusyKind, setInferenceBusyKind] = useState(null);
  const [reportList, setReportList] = useState([]);
  /**
   * After first "Generate report", holds draft text until the doctor clicks again to build the PDF.
   * @type {{ reportId: number, scanId: number, kind: 'tumor'|'alzheimer', findings: string, analysis: string, probs: string } | null}
   */
  const [reportDraft, setReportDraft] = useState(null);

  /** All four BraTS modalities chosen on disk — enables live ``/predict`` (View result) vs server pipeline. */
  const tumorFourModalityReady = useMemo(
    () => doctorModule === "tumor" && MRI_MODALITIES.every((m) => Boolean(uploadFiles[m])),
    [doctorModule, uploadFiles]
  );

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

  useEffect(() => {
    setReportDraft(null);
  }, [doctorModule]);

  useEffect(() => {
    if (!workflowScanId) {
      setReportDraft(null);
      return;
    }
    setReportDraft((d) => {
      if (!d) return null;
      return Number(d.scanId) === Number(workflowScanId) ? d : null;
    });
  }, [workflowScanId]);

  const closeMriViewer = useCallback(() => setMriViewer(null), []);

  const isTumorReq = (r) => !r.scan_kind || r.scan_kind === "mri";
  const isAlzReq = (r) => r.scan_kind === "alzheimer";
  const moduleRequests = requests.filter(doctorModule === "tumor" ? isTumorReq : isAlzReq);

  /** Scans that can use the report workflow (stays visible after status moves to analyzed) */
  const workflowScans = moduleRequests.filter((r) => r.status === "sent" || r.status === "analyzed");
  const openRequestsCount = workflowScans.length;
  const reportsSentCount = reportList.filter((report) => Boolean(report.sent_to_patient)).length;
  const totalCasesCount = moduleRequests.length;

  useEffect(() => {
    if (workflowScans.length === 0) {
      if (workflowScanId) setWorkflowScanId("");
      setPdfUnlockedScanId(null);
      setModelView(null);
      return;
    }
    const stillExists = workflowScans.some((scan) => String(scan.id) === workflowScanId);
    if (!workflowScanId || !stillExists) {
      setWorkflowScanId(String(workflowScans[0].id));
      setPdfUnlockedScanId(null);
      setModelView(null);
    }
  }, [workflowScans, workflowScanId]);

  const selectedWorkflowScan = requests.find((r) => String(r.id) === workflowScanId);
  const tumorReportReady = doctorModule !== "tumor" || (modelView && modelView.source === "live_segmentation");
  const alzViewReady = doctorModule !== "alzheimer" || Boolean(alzUploadImage);
  const alzReportReady = doctorModule !== "alzheimer" || (modelView && modelView.source === "live_alzheimer");
  /** Tumor full result page (`/results/:id`) — matches saved report for the selected scan when present. */
  const reportIdForWorkflowScan = reportList.find((r) => Number(r.scan_id) === Number(workflowScanId))?.id;

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

  /** Live BraTS segmentation on the four uploaded NIfTI files via ``POST /predict`` (same model as clinic pipeline). */
  const handleViewResultLocal = async () => {
    setViewBusy(true);
    setInferenceBusyKind("local");
    setError(null);
    setUploadNotice(null);
    setModelView(null);
    setPdfUnlockedScanId(null);

    const t1c = uploadFiles.t1c;
    const t1n = uploadFiles.t1n;
    const t2f = uploadFiles.t2f;
    const t2w = uploadFiles.t2w;

    try {
      if (!t1c || !t1n || !t2f || !t2w) {
        setError("Select all four modalities (t1c, t1n, t2f, t2w) to run the segmentation model.");
        return;
      }

      const data = await predictTumorSegmentation({ t1c, t1n, t2f, t2w });
      setModelView({
        prediction: data?.message || "Analysis completed",
        confidence: data?.confidence ?? null,
        probs: data?.probs || null,
        probsAreVoxelCounts: true,
        tumor_volume: data?.tumor_volume || null,
        output_image_url: data?.output_image || data?.output_image_url || null,
        model_version: data?.model_version || null,
        source: "live_segmentation",
      });
      setResultImageTs(Date.now());
      setUploadNotice(
        "Segmentation finished using the uploaded volumes. Files are kept so you can run View result again. Clear a modality to use Analyze stored scan on the server copy."
      );
    } catch (err) {
      setError(err.message || "Segmentation request failed");
      setModelView(null);
    } finally {
      setViewBusy(false);
      setInferenceBusyKind(null);
    }
  };

  const handleViewResultAlzheimerLocal = async () => {
    if (!workflowScanId) {
      setError("Select a patient scan first.");
      return;
    }
    if (!alzUploadImage) {
      setError("Upload Alzheimer PNG/JPG image first.");
      return;
    }
    setViewBusy(true);
    setInferenceBusyKind("local");
    setError(null);
    setUploadNotice(null);
    setModelView(null);
    setPdfUnlockedScanId(null);
    try {
      const data = await viewAlzheimerLocalResult(Number(workflowScanId), alzUploadImage);
      setModelView({
        prediction: data?.prediction || "Analysis completed",
        confidence: data?.confidence ?? null,
        probs: data?.probs || null,
        probsAreVoxelCounts: false,
        tumor_volume: null,
        output_image_url: data?.output_image_url || null,
        model_version: data?.model_version || null,
        preview_run_at: data?.preview_run_at || null,
        source: data?.source || "live_alzheimer",
      });
      setResultImageTs(Date.now());
    } catch (err) {
      setError(err.message || "Alzheimer local result failed");
      setModelView(null);
    } finally {
      setViewBusy(false);
      setInferenceBusyKind(null);
    }
  };

  const handleGenerateReport = async () => {
    if (!workflowScanId) {
      setError("Select which patient scan you are working on.");
      return;
    }
    const id = Number(workflowScanId);
    if (doctorModule === "tumor" && !tumorReportReady) {
      setError("Run View result first. Report uses the current model result.");
      return;
    }
    if (doctorModule === "alzheimer" && !alzReportReady) {
      setError("Run View result first. Report uses the current model result.");
      return;
    }
    const req = selectedWorkflowScan;
    if (!req?.patient_id) {
      setError("Could not resolve patient for this scan.");
      return;
    }

    const draftForThisScan =
      reportDraft && Number(reportDraft.scanId) === id ? reportDraft : null;

    try {
      setAnalyzingScans((prev) => new Set(prev).add(id));
      setError(null);

      if (draftForThisScan) {
        const finalizePayload = {
          report_id: draftForThisScan.reportId,
          findings_paragraph: draftForThisScan.findings,
          analysis_paragraph: draftForThisScan.analysis,
        };
        if (draftForThisScan.kind === "alzheimer") {
          finalizePayload.probs_paragraph = draftForThisScan.probs;
        }
        await finalizeReportPdf(finalizePayload);
        await loadRequests({ quiet: true });
        await loadReportList();
        const dlId = draftForThisScan.reportId;
        const url = reportPdfOpenUrl(dlId, { download: true });
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        setUploadNotice(
          "PDF saved on the server and download started. Use Report history below to send it to the patient when ready."
        );
        setReportDraft(null);
        setPdfUnlockedScanId(null);
        setModelView(null);
        return;
      }

      const gen = await generateSegmentationReport({
        scan_id: id,
        patient_id: req.patient_id,
        patient_name: req.patient?.name || null,
        age: req.patient?.age ?? null,
        use_current_result: doctorModule === "tumor" || doctorModule === "alzheimer",
        current_prediction: modelView?.prediction || null,
        current_confidence: modelView?.confidence ?? null,
        current_tumor_volume: doctorModule === "tumor" ? modelView?.tumor_volume || null : null,
        current_probs: modelView?.probs || null,
        current_output_image_url: modelView?.output_image_url || null,
        current_model_version: modelView?.model_version || null,
        skip_pdf: true,
      });

      const resolvedReportId =
        gen.reportId != null && gen.reportId !== "" ? Number(gen.reportId) : null;

      await loadRequests({ quiet: true });
      await loadReportList();

      if (!resolvedReportId) {
        setError("Report draft was created but the server did not return a report id.");
        return;
      }

      setReportDraft({
        reportId: resolvedReportId,
        scanId: id,
        kind: doctorModule === "alzheimer" ? "alzheimer" : "tumor",
        findings: gen.findings_paragraph ?? "",
        analysis: gen.analysis_paragraph ?? "",
        probs: gen.probs_paragraph ?? "",
      });
      setUploadNotice(
        "Review and edit the report text in the form below. When it is correct, click the same button again to build and download the PDF."
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
            Tumor: add four BraTS modalities below for <strong>View result</strong> (live model), or use{" "}
            <strong>Analyze stored scan</strong> on the server copy for PDF workflow. Alzheimer: stored PNG/JPEG only.
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
            onClick={loadRequests}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium border border-blue-600 hover:bg-blue-700"
          >
            Refresh
          </button>
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

      <div className="flex flex-wrap gap-3 mb-6">
        <button
          type="button"
          onClick={() => setDoctorModule("tumor")}
          className={`px-5 py-2.5 rounded-xl font-semibold border transition ${
            doctorModule === "tumor"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
          }`}
        >
          Tumor requests
        </button>
        <button
          type="button"
          onClick={() => setDoctorModule("alzheimer")}
          className={`px-5 py-2.5 rounded-xl font-semibold border transition ${
            doctorModule === "alzheimer"
              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
          }`}
        >
          Alzheimer requests
        </button>
      </div>

      <section className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-900">
            {doctorModule === "tumor" ? "Tumor queue" : "Alzheimer queue"}
          </h3>
          <span className="text-sm text-slate-500">{moduleRequests.length} assigned</span>
        </div>
        {moduleRequests.length === 0 ? (
          <p className="text-sm text-slate-600">No {doctorModule === "tumor" ? "tumor" : "Alzheimer"} requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {moduleRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-slate-500">Scan #{r.id}</div>
                  <div className="text-sm font-medium text-slate-900 truncate">{r.patient?.email || "Patient"}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Status: {r.status} · {r.file_name || "file"}
                  </div>
                </div>
                {doctorModule === "alzheimer" && r.file_url ? (
                  <div className="shrink-0">
                    <img
                      src={absoluteUrl(r.file_url)}
                      alt={`Scan ${r.id}`}
                      className="h-20 w-auto max-w-[140px] rounded-lg border border-slate-200 object-cover bg-black"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-slate-200 ring-1 ring-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {doctorModule === "tumor" ? "MRI — view model output & report" : "Alzheimer — view model output & report"}
          </h2>
          <div className="flex justify-center sm:justify-end w-full sm:w-auto shrink-0">
            {showUploadSection ? (
              <button
                type="button"
                onClick={() => setShowUploadSection(false)}
                className="px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                Hide upload
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowUploadSection(true)}
                className="px-4 py-2 rounded-lg font-medium bg-white border border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                Upload MRI
              </button>
            )}
          </div>
        </div>

        {showUploadSection ? (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-5">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-2">Patient scan (open request)</label>
              <select
                value={workflowScanId}
                onChange={(e) => {
                  setWorkflowScanId(e.target.value);
                  setModelView(null);
                  setPdfUnlockedScanId(null);
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

          {doctorModule === "tumor" ? (
          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors bg-slate-50/50"
          >
            <p className="text-sm font-medium text-slate-700 mb-1">Four BraTS modalities (clinical segmentation)</p>
            <p className="text-xs text-slate-500 mb-3">
              NIfTI (<span className="font-mono">.nii</span>, <span className="font-mono">.nii.gz</span>) per modality. When all four are selected, use{" "}
              <strong>View result</strong> to run the same 3D BraTS SegResNet used by <span className="font-mono">/predict</span> on these files. PDF
              generation still uses the patient&apos;s <strong>server-stored</strong> scan — clear a file or use{" "}
              <strong>Analyze stored scan</strong> for that path.
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
          ) : (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm text-indigo-950">
              <p className="mb-3">
                Alzheimer: after download, upload a PNG/JPG scan below and run <strong>View result</strong>.
              </p>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="text-xs text-slate-500 mb-2 break-all">
                  {alzUploadImage ? alzUploadImage.name : "No image selected"}
                </div>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="doctor-alz-input"
                    className="text-blue-600 font-semibold cursor-pointer hover:underline text-sm"
                  >
                    Choose PNG/JPG
                  </label>
                  <input
                    id="doctor-alz-input"
                    type="file"
                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setAlzUploadImage(file);
                      setUploadNotice(null);
                    }}
                  />
                  {alzUploadImage && (
                    <button
                      type="button"
                      className="text-sm text-slate-500 underline"
                      onClick={() => {
                        setAlzUploadImage(null);
                        const input = document.getElementById("doctor-alz-input");
                        if (input) input.value = "";
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3">
            {doctorModule === "tumor" && tumorFourModalityReady ? (
              <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                All four modalities are selected. Use <strong>View result</strong> for live segmentation on these files.{" "}
                <strong>Analyze stored scan</strong> is disabled until you clear at least one file (it runs on the
                server-side patient volume).
              </p>
            ) : null}
            {doctorModule === "tumor" && !tumorFourModalityReady ? (
              <p className="text-xs text-slate-600">
                Choose all four NIfTI modalities above to enable <strong>View result</strong> (production BraTS model on your
                uploads).
              </p>
            ) : null}
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              {doctorModule === "tumor" ? (
                <button
                  type="button"
                  onClick={handleViewResultLocal}
                  disabled={viewBusy || !tumorFourModalityReady}
                  className="flex-1 min-w-[180px] px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {viewBusy && inferenceBusyKind === "local" ? "Running model…" : "View result"}
                </button>
              ) : null}
              {doctorModule === "alzheimer" ? (
                <button
                  type="button"
                  onClick={handleViewResultAlzheimerLocal}
                  disabled={viewBusy || !alzViewReady}
                  className="flex-1 min-w-[180px] px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {viewBusy && inferenceBusyKind === "local" ? "Running model…" : "View result"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={
                  !workflowScanId ||
                  workflowScans.length === 0 ||
                  viewBusy ||
                  !(doctorModule === "tumor" ? tumorReportReady : alzReportReady) ||
                  analyzingScans.has(Number(workflowScanId))
                }
                className="flex-1 min-w-[160px] px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {analyzingScans.has(Number(workflowScanId))
                  ? reportDraft && Number(reportDraft.scanId) === Number(workflowScanId)
                    ? "Building PDF…"
                    : "Generating…"
                  : reportDraft && Number(reportDraft.scanId) === Number(workflowScanId)
                  ? "Download report (PDF)"
                  : "Generate report (PDF)"}
              </button>
            </div>

            {reportDraft && Number(reportDraft.scanId) === Number(workflowScanId) ? (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4 md:p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">Review report (editable)</h3>
                <p className="text-xs text-slate-600">
                  Update any details below, then click <strong>Download report (PDF)</strong> to save the PDF on the server
                  and download it.
                </p>
                <div>
                  <label htmlFor="doctor-report-findings" className="block text-xs font-medium text-slate-700 mb-1">
                    Findings
                  </label>
                  <textarea
                    id="doctor-report-findings"
                    value={reportDraft.findings}
                    onChange={(e) => setReportDraft((d) => (d ? { ...d, findings: e.target.value } : d))}
                    rows={5}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="doctor-report-analysis" className="block text-xs font-medium text-slate-700 mb-1">
                    Analysis
                  </label>
                  <textarea
                    id="doctor-report-analysis"
                    value={reportDraft.analysis}
                    onChange={(e) => setReportDraft((d) => (d ? { ...d, analysis: e.target.value } : d))}
                    rows={5}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                {reportDraft.kind === "alzheimer" ? (
                  <div>
                    <label htmlFor="doctor-report-probs" className="block text-xs font-medium text-slate-700 mb-1">
                      Class probabilities (shown in PDF)
                    </label>
                    <textarea
                      id="doctor-report-probs"
                      value={reportDraft.probs}
                      onChange={(e) => setReportDraft((d) => (d ? { ...d, probs: e.target.value } : d))}
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="text-xs text-slate-600">
              For Tumor, generate report is enabled after View result and uses the current model result. First click
              prepares editable text; the second click builds and downloads the PDF.
            </p>
          </div>

          {modelView && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-6">
              {modelView.source === "live_segmentation" ? (
                <p className="text-xs text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-2 mb-4">
                  <strong>Live model output</strong> — 3D BraTS SegResNet via <span className="font-mono">POST /predict</span> on
                  your four uploads (not a mock). Patient PDFs still require the server-stored scan: clear a local file, then
                  run <strong>Analyze stored scan</strong> and <strong>Generate report (PDF)</strong>.
                </p>
              ) : null}
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
                    {modelView.tumor_volume ? (
                      <div>
                        <span className="text-slate-500 font-sans text-xs uppercase tracking-wide">Tumor volume (voxel proxy)</span>
                        <div>{modelView.tumor_volume}</div>
                      </div>
                    ) : null}
                  </div>
                  {modelView.probs && (
                    <div className="bg-white rounded-lg p-4 border border-slate-200 font-mono text-sm">
                      <div className="text-xs text-slate-500 font-sans mb-2">
                        {modelView.probsAreVoxelCounts ? "Label id → voxel count (segmentation mask)" : "Class → estimated %"}
                      </div>
                      {Object.entries(modelView.probs).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4 py-1 border-b border-slate-100 last:border-0">
                          <span className="text-slate-700">{k}</span>
                          <span>
                            {modelView.probsAreVoxelCounts
                              ? Number(v).toLocaleString()
                              : `${v}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {doctorModule === "tumor" && modelView.source === "stored_scan" && reportIdForWorkflowScan ? (
                    <div className="pt-2">
                      <Link
                        to={`/results/${reportIdForWorkflowScan}`}
                        className="inline-flex px-4 py-2 rounded-lg border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 text-sm"
                      >
                        View result summary
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {uploadNotice && <p className="mt-4 text-sm text-slate-600">{uploadNotice}</p>}
        </>
        ) : null}

        <DoctorReportHistoryBlock
          reportList={reportList}
          openReportPdfDownload={openReportPdfDownload}
          sendSegReportToPatient={sendSegReportToPatient}
          sendingReports={sendingReports}
          showViewResultLink={doctorModule === "tumor" || doctorModule === "alzheimer"}
        />
      </section>

      {mriViewer && (
        <MriViewerModal scanId={mriViewer.id} fileLabel={mriViewer.label} onClose={closeMriViewer} />
      )}
    </div>
  );
}
