import React, { useEffect, useState } from "react";
import {
  deletePatientTumorScan,
  fetchReportPdfBlobByReportId,
  getPatientScans,
  listDoctors,
  listReports,
  reportPdfOpenUrl,
  uploadPatientAlzImage,
  uploadPatientMriZip,
} from "../api";

const StatCard = ({ title, value, icon }) => (
  <div className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4">
    <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
      {icon}
    </div>
    <div>
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
    </div>
  </div>
);

const statusClasses = {
  pending: "bg-yellow-100 text-yellow-800",
  sent: "bg-blue-100 text-blue-800",
  analyzed: "bg-purple-100 text-purple-800",
  reported: "bg-green-100 text-green-800",
};

const isTumorScan = (scan) => !scan.scan_kind || scan.scan_kind === "mri";
const isAlzScan = (scan) => scan.scan_kind === "alzheimer";

/** Latest report row for a scan (doctor may regenerate). */
function latestReportForScan(reportsList, scanId) {
  const rows = reportsList.filter((r) => r.scan_id === scanId);
  if (!rows.length) return null;
  return rows.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
}

/** Patient-facing label for tumor requests sent to the doctor (pending / sent / reported). */
function tumorRequestStatusLabel(scan) {
  const s = (scan.status || "").toLowerCase();
  if (s === "reported") return { key: "reported", label: "Reported" };
  if (s === "pending") return { key: "pending", label: "Pending" };
  // sent, analyzed, or anything else in-flight with the clinic
  return { key: "sent", label: "Sent" };
}

const tumorRequestStatusClasses = {
  pending: "bg-amber-100 text-amber-900",
  sent: "bg-blue-100 text-blue-800",
  reported: "bg-green-100 text-green-800",
};

export default function PatientDashboardPage() {
  const [scans, setScans] = useState([]);
  const [reports, setReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [alzImageFile, setAlzImageFile] = useState(null);
  const [uploadDoctorId, setUploadDoctorId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [deletingTumorScanId, setDeletingTumorScanId] = useState(null);
  /** @type {['tumor','alzheimer']} */
  const [dashMode, setDashMode] = useState("tumor");

  const tumorScans = scans.filter(isTumorScan);
  const alzScans = scans.filter(isAlzScan);
  const activeScans = dashMode === "tumor" ? tumorScans : alzScans;

  const pendingScans = activeScans.filter((scan) => scan.status === "pending");
  const withDoctor = activeScans.filter((scan) => scan.status === "sent" || scan.status === "analyzed");
  const openRequestsCount = withDoctor.length;
  const reportsReceivedCount = reports.filter((rep) => {
    const sid = rep.scan_id;
    if (sid == null) return false;
    const sc = scans.find((s) => s.id === sid);
    if (!sc) return true;
    return dashMode === "tumor" ? isTumorScan(sc) : isAlzScan(sc);
  }).length;
  const totalCasesCount = activeScans.length;

  const reportsForCurrentMode = reports.filter((rep) => {
    const sid = rep.scan_id;
    if (sid == null) return false;
    const sc = scans.find((s) => s.id === sid);
    if (!sc) return true;
    return dashMode === "tumor" ? isTumorScan(sc) : isAlzScan(sc);
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [scansData, reportsData, doctorsData] = await Promise.all([
        getPatientScans(),
        listReports(),
        listDoctors(),
      ]);
      setScans(scansData || []);
      setReports(reportsData || []);
      setDoctors(doctorsData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (doctors.length === 1 && uploadDoctorId === "") {
      setUploadDoctorId(String(doctors[0].id));
    }
  }, [doctors, uploadDoctorId]);

  const handleUploadMRI = async (event) => {
    event.preventDefault();
    if (!zipFile) {
      setError("Choose a ZIP file that includes your MRI volumes.");
      return;
    }
    if (doctors.length === 0) {
      setError("No doctors are registered yet. Ask an administrator to add a doctor account before uploading.");
      return;
    }
    if (!uploadDoctorId) {
      setError("Select which doctor should receive this MRI.");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setNotice(null);
      const created = await uploadPatientMriZip(zipFile, uploadDoctorId);
      setZipFile(null);
      const input = document.getElementById("mri-zip-input");
      if (input) input.value = "";
      setUploadDoctorId("");
      await loadData();
      setNotice(
        `Scan #${created.id} was uploaded and sent to doctor ID ${created?.doctor_id ?? uploadDoctorId}. ` +
          "It will appear on their dashboard for review."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadAlz = async (event) => {
    event.preventDefault();
    if (!alzImageFile) {
      setError("Choose a PNG or JPEG image for Alzheimer detection.");
      return;
    }
    if (doctors.length === 0) {
      setError("No doctors are registered yet. Ask an administrator to add a doctor account before uploading.");
      return;
    }
    if (!uploadDoctorId) {
      setError("Select which doctor should receive this image.");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setNotice(null);
      const created = await uploadPatientAlzImage(alzImageFile, uploadDoctorId);
      setAlzImageFile(null);
      const input = document.getElementById("alz-image-input");
      if (input) input.value = "";
      setUploadDoctorId("");
      await loadData();
      setNotice(
        `Alzheimer scan #${created.id} was uploaded and sent to doctor ID ${created?.doctor_id ?? uploadDoctorId}. ` +
          "It will appear on their dashboard for review."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const viewReportPdf = (reportId) => {
    const url = reportPdfOpenUrl(reportId, { download: false });
    if (!url) {
      setError("Not signed in.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadReportPdf = (reportId) => {
    const url = reportPdfOpenUrl(reportId, { download: true });
    if (!url) {
      setError("Not signed in.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const downloadReportPdfToDisk = async (reportId) => {
    const id = Number(reportId);
    if (!id) return;
    try {
      setError(null);
      const blob = await fetchReportPdfBlobByReportId(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `NeuroScan_report_${id}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || "Could not download report. Try View PDF or sign in again.");
    }
  };

  const handleDeleteTumorRequest = async (scanId) => {
    const id = Number(scanId);
    if (!id) return;
    if (
      !window.confirm(
        "Delete this tumor request? It will be removed for you and your doctor, including any stored MRI, results, and reports. This cannot be undone."
      )
    ) {
      return;
    }
    try {
      setDeletingTumorScanId(id);
      setError(null);
      await deletePatientTumorScan(id);
      const [scansData, reportsData] = await Promise.all([getPatientScans(), listReports()]);
      setScans(scansData || []);
      setReports(reportsData || []);
      setNotice(`Tumor request #${id} was deleted.`);
    } catch (e) {
      setError(e?.message || "Could not delete this request.");
    } finally {
      setDeletingTumorScanId(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading patient dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-10 px-6 md:px-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Patient Dashboard</h2>
          <p className="text-slate-500 mt-1">
            Tumor: upload your MRI volumes in one ZIP file and send them to your doctor. Alzheimer: upload one brain MRI
            image (PNG or JPEG). For both paths, follow your requests below; when your doctor shares a report, download the
            PDF from Reports from your doctor (tumor) or use View PDF / Download on your Alzheimer scan row.
          </p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0 items-center">
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium border border-blue-600 hover:bg-blue-700"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <StatCard
          title="Open Requests"
          value={openRequestsCount}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
        />
        <StatCard
          title="Reports Received"
          value={reportsReceivedCount}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586A1 1 0 0113.293 3.293l4.414 4.414A1 1 0 0118 8.414V19a2 2 0 01-2 2z" /></svg>}
        />
        <StatCard
          title="Total Cases"
          value={totalCasesCount}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" /></svg>}
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">
          {notice}
        </div>
      )}

      {pendingScans.length > 0 && dashMode === "tumor" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-amber-900 text-sm">
          <strong>{pendingScans.length} older scan(s) are not linked to a doctor.</strong> New uploads always include a
          doctor. If you need help assigning these, contact support or your clinic administrator.
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-8">
        <button
          type="button"
          onClick={() => setDashMode("tumor")}
          className={`px-5 py-2.5 rounded-xl font-semibold border transition ${
            dashMode === "tumor"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
          }`}
        >
          Tumor Detection
        </button>
        <button
          type="button"
          onClick={() => setDashMode("alzheimer")}
          className={`px-5 py-2.5 rounded-xl font-semibold border transition ${
            dashMode === "alzheimer"
              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
          }`}
        >
          Alzheimer Detection
        </button>
      </div>

      <div className="space-y-6">
        {dashMode === "tumor" && (
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Upload MRI (ZIP)</h3>
          <form onSubmit={handleUploadMRI} className="space-y-4">
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-500 transition">
              <input
                id="mri-zip-input"
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => setZipFile(event.target.files?.[0] || null)}
                className="hidden"
              />
              <label htmlFor="mri-zip-input" className="cursor-pointer block">
                <div className="text-blue-600 mb-2">
                  <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-slate-800 font-medium">MRI scans as one .zip</div>
                <div className="text-sm text-slate-500 mt-1 break-all">
                  {zipFile ? zipFile.name : "Choose ZIP file"}
                </div>
              </label>
            </div>
            <p className="text-sm text-slate-500">
              Put at least four NIfTI volumes in the ZIP (<code className="text-xs bg-slate-100 px-1 rounded">.nii</code>{" "}
              or <code className="text-xs bg-slate-100 px-1 rounded">.nii.gz</code>), in any folder. If the archive
              contains exactly four such files, they are accepted as-is; if you include more than four, use filenames
              that mention <strong>t1c</strong>, <strong>t1n</strong>, <strong>t2f</strong>, and <strong>t2w</strong> so
              the correct series can be picked.
            </p>

            <div>
              <label className="text-sm text-slate-600 block mb-2">
                Doctor who will receive this MRI <span className="text-red-600">(required)</span>
              </label>
              {doctors.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  No doctors are available. Register at least one doctor account before patients can upload.
                </p>
              ) : (
                <>
                  <select
                    value={uploadDoctorId}
                    onChange={(e) => setUploadDoctorId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select doctor…</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {(doctor.name || doctor.email)} | ID {doctor.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    The scan is sent to this doctor as soon as the upload completes.
                  </p>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !zipFile || doctors.length === 0 || !uploadDoctorId}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload ZIP & send to doctor"}
            </button>
          </form>
        </section>
        )}

        {dashMode === "alzheimer" && (
        <section className="bg-white rounded-2xl shadow-sm p-6 border border-indigo-100 ring-1 ring-indigo-50">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Alzheimer detection (image)</h3>
          <p className="text-sm text-slate-600 mb-4">
            Upload one brain MRI image (PNG or JPEG). Your doctor will review it and run the Alzheimer model — no ZIP
            archive required.
          </p>
          <form onSubmit={handleUploadAlz} className="space-y-4">
            <div className="border-2 border-dashed border-indigo-300 rounded-lg p-6 text-center hover:border-indigo-500 transition">
              <input
                id="alz-image-input"
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={(event) => setAlzImageFile(event.target.files?.[0] || null)}
                className="hidden"
              />
              <label htmlFor="alz-image-input" className="cursor-pointer block">
                <div className="text-indigo-600 mb-2">
                  <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-slate-800 font-medium">PNG or JPEG image</div>
                <div className="text-sm text-slate-500 mt-1 break-all">
                  {alzImageFile ? alzImageFile.name : "Choose image file"}
                </div>
              </label>
            </div>

            <div>
              <label className="text-sm text-slate-600 block mb-2">
                Doctor who will receive this image <span className="text-red-600">(required)</span>
              </label>
              {doctors.length === 0 ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  No doctors are available. Register at least one doctor account before patients can upload.
                </p>
              ) : (
                <select
                  value={uploadDoctorId}
                  onChange={(e) => setUploadDoctorId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select doctor…</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {(doctor.name || doctor.email)} | ID {doctor.id}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || !alzImageFile || doctors.length === 0 || !uploadDoctorId}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload image & send to doctor"}
            </button>
          </form>
        </section>
        )}

        {dashMode === "tumor" ? (
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">My scans (Tumor)</h3>
            <span className="text-sm text-slate-500">{tumorScans.length} total</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Requests you sent to your doctor. <strong>Pending</strong> is not yet with a doctor; <strong>Sent</strong> means
            the clinic has your case; <strong>Reported</strong> means your doctor has finalized a report — open{" "}
            <em>Reports from your doctor</em> below to download the PDF. Use <strong>Delete</strong> to remove a request
            from both sides (MRI, results, and reports).
          </p>

          {tumorScans.length === 0 ? (
            <p className="text-slate-500">Upload a ZIP to create your first tumor scan.</p>
          ) : (
            <div className="space-y-3">
              {tumorScans.map((scan) => {
                const { key, label } = tumorRequestStatusLabel(scan);
                return (
                  <div
                    key={scan.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <div className="text-xs font-mono text-slate-500">Scan ID {scan.id}</div>
                      <div className="text-sm font-semibold text-slate-800">{scan.file_name || `File #${scan.id}`}</div>
                      <div className="text-xs text-slate-600 mt-1">
                        Doctor:{" "}
                        {scan.doctor
                          ? `${scan.doctor.name || scan.doctor.email} (ID ${scan.doctor_id ?? scan.doctor.id})`
                          : scan.status === "pending"
                            ? "Not assigned"
                            : "—"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Uploaded: {scan.upload_date ? new Date(scan.upload_date).toLocaleString() : "Unknown"}
                        {scan.sent_date ? (
                          <span className="ml-2">· Sent: {new Date(scan.sent_date).toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          tumorRequestStatusClasses[key] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {label}
                      </span>
                      <button
                        type="button"
                        disabled={deletingTumorScanId === scan.id}
                        onClick={() => handleDeleteTumorRequest(scan.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deletingTumorScanId === scan.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        ) : (
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">My scans (Alzheimer)</h3>
            <span className="text-sm text-slate-500">{activeScans.length} total</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Status mirrors your doctor&apos;s queue: <em>sent</em> and <em>analyzed</em> mean your case is with the
            clinic; <em>reported</em> means a PDF is ready. Use View PDF and Download on the row for that scan.
          </p>

          {activeScans.length === 0 ? (
            <p className="text-slate-500">No Alzheimer uploads yet.</p>
          ) : (
            <div className="space-y-3">
              {activeScans.map((scan) => {
                const latestRep = latestReportForScan(reports, scan.id);
                return (
                <div key={scan.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-xs font-mono text-slate-500">
                      Scan ID {scan.id}{" "}
                      <span
                        className={`ml-2 px-2 py-0.5 rounded text-[10px] font-sans ${
                          isAlzScan(scan) ? "bg-indigo-100 text-indigo-800" : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {isAlzScan(scan) ? "Alzheimer" : "Tumor"}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-800">{scan.file_name || `File #${scan.id}`}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      Doctor:{" "}
                      {scan.doctor
                        ? `${scan.doctor.name || scan.doctor.email} (ID ${scan.doctor_id ?? scan.doctor.id})`
                        : scan.status === "pending"
                          ? "Not assigned"
                          : "—"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Uploaded: {scan.upload_date ? new Date(scan.upload_date).toLocaleString() : "Unknown"}
                      {scan.sent_date ? (
                        <span className="ml-2">· Sent: {new Date(scan.sent_date).toLocaleString()}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusClasses[scan.status] || "bg-slate-100 text-slate-700"}`}>
                      {scan.status}
                    </span>
                    {scan.status === "reported" && latestRep ? (
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        <button
                          type="button"
                          onClick={() => viewReportPdf(latestRep.id)}
                          className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-medium hover:bg-slate-200 border border-slate-200"
                        >
                          View PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadReportPdf(latestRep.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                        >
                          Download
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {dashMode === "tumor" && (
        <section className="bg-white rounded-2xl shadow-sm p-6 border border-emerald-100 ring-1 ring-emerald-50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">Reports from your doctor</h3>
              <p className="text-xs text-slate-500 mt-1">
                PDF reports your doctor has sent to you. Each row shows <strong>Received</strong> and{" "}
                <strong>Reported</strong>; use <strong>Download PDF</strong> to save the file.
              </p>
            </div>
            <span className="text-sm text-slate-500 shrink-0">{reportsForCurrentMode.length} in this module</span>
          </div>

          {reportsForCurrentMode.length === 0 ? (
            <p className="text-slate-600 text-sm bg-slate-50 rounded-lg px-4 py-6 border border-slate-100">
              No reports yet for tumor cases. When a report is ready, it will appear here and you can download it.
            </p>
          ) : (
            <ul className="space-y-3">
              {reportsForCurrentMode.map((rep) => (
                <li
                  key={rep.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50/80"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-100 text-teal-900">
                        Received
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-900">
                        Reported
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      Report #{rep.id}
                      <span className="text-slate-400 font-normal"> · Scan #{rep.scan_id}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Doctor: {rep.doctor_name || "—"}
                      {rep.created_at ? (
                        <span className="ml-2">· {new Date(rep.created_at).toLocaleString()}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => downloadReportPdfToDisk(rep.id)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                    >
                      Download PDF
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

      </div>
    </div>
  );
}
