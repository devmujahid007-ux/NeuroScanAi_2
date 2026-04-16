import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import {
  getPatientScans,
  listDoctors,
  listReports,
  reportPdfOpenUrl,
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

export default function PatientDashboardPage() {
  const [scans, setScans] = useState([]);
  const [reports, setReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [uploadDoctorId, setUploadDoctorId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const pendingScans = scans.filter((scan) => scan.status === "pending");
  const withDoctor = scans.filter((scan) => scan.status === "sent" || scan.status === "analyzed");
  const reportByScanId = new Map(reports.map((report) => [report.scan_id, report]));
  const openRequestsCount = withDoctor.length;
  const reportsReceivedCount = reports.length;
  const totalCasesCount = scans.length;

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

  const openReportView = (reportId) => {
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading patient dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-10 px-6 md:px-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Patient Dashboard</h2>
          <p className="text-slate-500 mt-1">
            Upload a ZIP of your MRI scans, send them to your doctor, and open PDF reports in the browser.
          </p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0 items-center">
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
          <LogoutButton />
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

      {pendingScans.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-amber-900 text-sm">
          <strong>{pendingScans.length} older scan(s) are not linked to a doctor.</strong> New uploads always include a
          doctor. If you need help assigning these, contact support or your clinic administrator.
        </div>
      )}

      <div className="space-y-6">
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

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">My scans</h3>
            <span className="text-sm text-slate-500">{scans.length} total</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Status mirrors your doctor&apos;s queue: <em>sent</em> and <em>analyzed</em> mean your case is with the
            clinic; <em>reported</em> means a PDF report is available below.
          </p>

          {scans.length === 0 ? (
            <p className="text-slate-500">Upload a ZIP to create your first scan.</p>
          ) : (
            <div className="space-y-3">
              {scans.map((scan) => (
                <div key={scan.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 bg-slate-50 rounded-lg">
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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusClasses[scan.status] || "bg-slate-100 text-slate-700"}`}>
                      {scan.status}
                    </span>
                    {scan.status === "reported" && reportByScanId.get(scan.id) ? (
                      <button
                        type="button"
                        onClick={() => downloadReportPdf(reportByScanId.get(scan.id).id)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                      >
                        Download report
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Your reports</h3>
            <span className="text-sm text-slate-500">{reports.length} available</span>
          </div>

          {reports.length === 0 ? (
            <p className="text-slate-500">No completed reports yet. When your doctor shares a report, it will appear here.</p>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">Report #{report.id}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Doctor: {report.doctor_name || `Doctor #${report.doctor_id}`}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Date: {report.created_at ? new Date(report.created_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {report.confidence != null ? `${Math.round(report.confidence)}%` : "—"}
                      </div>
                      <div className="text-xs text-slate-500">confidence</div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-sm text-slate-700">
                    <div className="bg-blue-50 rounded p-3">
                      <strong>Prediction:</strong> {report.prediction || "—"}
                    </div>
                    <div className="bg-slate-50 rounded p-3">
                      <strong>Scan:</strong> #{report.scan_id}
                    </div>
                  </div>

                  {report.summary ? (
                    <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
                      <strong>Summary:</strong> {report.summary}
                    </div>
                  ) : null}
                  {report.recommendation ? (
                    <div className="bg-slate-50 rounded p-3 text-sm text-slate-700 whitespace-pre-line">
                      <strong>Recommendation:</strong> {`\n${report.recommendation}`}
                    </div>
                  ) : null}

                  <div className="grid md:grid-cols-3 gap-3">
                    <Link
                      to={`/results/${report.id}`}
                      className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 text-center"
                    >
                      View result summary
                    </Link>
                    <button
                      type="button"
                      onClick={() => openReportView(report.id)}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                    >
                      Open PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadReportPdf(report.id)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
