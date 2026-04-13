import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import {
  MRI_MODALITIES,
  absoluteUrl,
  getPatientReports,
  getPatientScans,
  listDoctors,
  sendScanToDoctor,
  uploadMRI,
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

const MRI_MODALITY_LABELS = {
  t1c: "T1C",
  t1n: "T1N",
  t2f: "T2F",
  t2w: "T2W",
};

function emptyUploadFiles() {
  return { t1c: null, t1n: null, t2f: null, t2w: null };
}

export default function PatientDashboardPage() {
  const [scans, setScans] = useState([]);
  const [reports, setReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctors, setSelectedDoctors] = useState({});
  const [uploadFiles, setUploadFiles] = useState(emptyUploadFiles);
  const [uploadDoctorId, setUploadDoctorId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [requestingScanId, setRequestingScanId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const pendingScans = scans.filter((scan) => scan.status === "pending");
  const awaitingDoctorAnalysis = scans.filter((scan) => scan.status === "sent");
  const awaitingReportFromDoctor = scans.filter((scan) => scan.status === "analyzed");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [scansData, reportsData, doctorsData] = await Promise.all([
        getPatientScans(),
        getPatientReports(),
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

  useEffect(() => {
    if (doctors.length !== 1) return;
    const onlyId = doctors[0].id;
    setSelectedDoctors((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const scan of scans) {
        if (scan.status !== "pending") continue;
        if (next[scan.id] == null || next[scan.id] === "") {
          next[scan.id] = onlyId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [doctors, scans]);

  const handleUploadMRI = async (event) => {
    event.preventDefault();
    const missingModalities = MRI_MODALITIES.filter((modality) => !uploadFiles[modality]);
    if (missingModalities.length > 0) {
      setError(`Please choose all 4 MRI files before uploading. Missing: ${missingModalities.join(", ")}.`);
      return;
    }
    if (doctors.length === 0) {
      setError("No doctors are registered yet. Ask an administrator to add a doctor account before uploading.");
      return;
    }
    if (!uploadDoctorId) {
      setError("Select which doctor should receive this MRI. It will appear in their Open requests right after upload.");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setNotice(null);
      const created = await uploadMRI(uploadFiles, uploadDoctorId);
      setUploadFiles(emptyUploadFiles());
      setUploadDoctorId("");
      for (const modality of MRI_MODALITIES) {
        const fileInput = document.getElementById(`mri-file-input-${modality}`);
        if (fileInput) fileInput.value = "";
      }
      await loadData();
      setNotice(
        `Scan #${created.id} was sent to doctor ID ${created?.doctor_id ?? uploadDoctorId}. ` +
          "They will see it under Open requests (status: sent) after refreshing."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRequestReport = async (scanId) => {
    const doctorId = selectedDoctors[scanId];
    if (!doctorId) {
      setError("Select a doctor before requesting a report.");
      return;
    }

    try {
      setRequestingScanId(scanId);
      setError(null);
      setNotice(null);
      const result = await sendScanToDoctor(scanId, doctorId);
      await loadData();
      const docEmail = result?.doctor?.email || `doctor ID ${doctorId}`;
      const assignedId = result?.doctor_id ?? result?.doctor?.id ?? doctorId;
      setNotice(
        `Scan #${result?.scan_id ?? scanId} is now assigned to ${docEmail} (doctor ID ${assignedId}). ` +
          "That doctor will see it under Open requests on their dashboard using the same scan number."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestingScanId(null);
    }
  };

  const handleDownload = (report) => {
    const href = absoluteUrl(report.download_url);
    if (!href) {
      setError("This report file is not ready yet.");
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading patient dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-10 px-6 md:px-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Patient Dashboard</h2>
          <p className="text-slate-500 mt-1">Upload MRI scans, request doctor reports, and download final results.</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-10">
        <StatCard
          title="Uploaded Scans"
          value={scans.length}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
        />
        <StatCard
          title="With doctor (awaiting analysis)"
          value={awaitingDoctorAnalysis.length}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586A1 1 0 0113.293 3.293l4.414 4.414A1 1 0 0118 8.414V19a2 2 0 01-2 2z" /></svg>}
        />
        <StatCard
          title="Analysis done (report pending)"
          value={awaitingReportFromDoctor.length}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        />
        <StatCard
          title="Completed Reports"
          value={reports.length}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" /></svg>}
        />
        <StatCard
          title="Waiting To Send"
          value={pendingScans.length}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
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
          <strong>{pendingScans.length} scan(s) are still not sent to any doctor.</strong> Doctors only see scans
          with status &quot;sent&quot; or later — not &quot;pending&quot;. Scroll to{" "}
          <strong>Request Reports</strong>, pick a doctor for each scan, and click{" "}
          <strong>Request report</strong>. (New uploads now require a doctor so this should not happen again.)
        </div>
      )}

      <div className="space-y-6">
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Upload MRI Scan</h3>
          <form onSubmit={handleUploadMRI} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MRI_MODALITIES.map((modality) => (
                <div key={modality} className="border-2 border-dashed border-blue-300 rounded-lg p-5 text-center hover:border-blue-500 transition">
                  <input
                    id={`mri-file-input-${modality}`}
                    type="file"
                    accept=".dcm,.dicom,.nii,.nii.gz"
                    onChange={(event) => setUploadFiles((prev) => ({ ...prev, [modality]: event.target.files?.[0] || null }))}
                    className="hidden"
                  />
                  <label htmlFor={`mri-file-input-${modality}`} className="cursor-pointer block">
                    <div className="text-blue-600 mb-2">
                      <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div className="text-slate-800 font-medium">{MRI_MODALITY_LABELS[modality]}</div>
                    <div className="text-sm text-slate-500 mt-1 break-all">
                      {uploadFiles[modality] ? uploadFiles[modality].name : `Choose ${MRI_MODALITY_LABELS[modality]} file`}
                    </div>
                  </label>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-500">
              Upload all 4 modalities in this exact set: <strong>T1C</strong>, <strong>T1N</strong>, <strong>T2F</strong>, <strong>T2W</strong>.
              Supported formats: DICOM (.dcm, .dicom) and NIfTI (.nii, .nii.gz).
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
                    The scan is sent to this doctor immediately so it appears under Open requests on their dashboard.
                  </p>
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={uploading || MRI_MODALITIES.some((modality) => !uploadFiles[modality]) || doctors.length === 0 || !uploadDoctorId}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload & send to doctor"}
            </button>
          </form>
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Request Reports</h3>
            <span className="text-sm text-slate-500">{pendingScans.length} scans ready to send</span>
          </div>

          {pendingScans.length === 0 ? (
            <p className="text-slate-500">Every uploaded scan has already been sent to a doctor, or you have no uploads yet.</p>
          ) : (
            <div className="space-y-4">
              {pendingScans.map((scan) => (
                <div key={scan.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-slate-500">Scan ID {scan.id}</div>
                      <div className="text-sm font-semibold text-slate-800">{scan.file_name || `File #${scan.id}`}</div>
                      <div className="text-xs text-slate-500 mt-1">Uploaded: {scan.upload_date ? new Date(scan.upload_date).toLocaleString() : "Unknown"}</div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusClasses[scan.status] || "bg-slate-100 text-slate-700"}`}>
                      {scan.status}
                    </span>
                  </div>

                  <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="text-sm text-slate-600 block mb-2">Choose doctor for analysis</label>
                      <select
                        value={selectedDoctors[scan.id] || ""}
                        onChange={(event) => setSelectedDoctors((prev) => ({
                          ...prev,
                          [scan.id]: event.target.value ? Number(event.target.value) : null,
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select doctor...</option>
                        {doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {(doctor.name || doctor.email)} | {doctor.email} | ID {doctor.id}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRequestReport(scan.id)}
                      disabled={requestingScanId === scan.id || !selectedDoctors[scan.id]}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {requestingScanId === scan.id ? "Sending..." : "Request Report"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {doctors.length > 0 && (
            <div className="mt-4 text-xs text-slate-500">
              The doctor you select must log in with the same account as the <strong>doctor ID</strong> shown in the
              dropdown; only that account will see the request under the same <strong>Scan ID</strong> after you send.
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">MRI workflow (matches doctor dashboard)</h3>
            <span className="text-sm text-slate-500">{scans.length} total scans</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Use the same <strong>Scan ID</strong> and <strong>doctor ID</strong> here as on the doctor side:{" "}
            <em>sent</em> appears in the doctor's Open requests, <em>analyzed</em> in Analyzed cases,{" "}
            <em>reported</em> when the report has been sent back to you.
          </p>

          {scans.length === 0 ? (
            <p className="text-slate-500">Upload your first MRI scan to start the workflow.</p>
          ) : (
            <div className="space-y-3">
              {scans.map((scan) => (
                <div key={scan.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-xs font-mono text-slate-500">Scan ID {scan.id}</div>
                    <div className="text-sm font-semibold text-slate-800">{scan.file_name || `File #${scan.id}`}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      Assigned doctor:{" "}
                      {scan.doctor
                        ? `${scan.doctor.name || scan.doctor.email} (ID ${scan.doctor_id ?? scan.doctor.id})`
                        : scan.status === "pending"
                          ? "Not assigned yet — choose a doctor above"
                          : "—"}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Uploaded: {scan.upload_date ? new Date(scan.upload_date).toLocaleString() : "Unknown"}
                      {scan.sent_date ? (
                        <span className="ml-2">· Sent to doctor: {new Date(scan.sent_date).toLocaleString()}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 ${statusClasses[scan.status] || "bg-slate-100 text-slate-700"}`}>
                    {scan.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Reports Ready To Download</h3>
            <span className="text-sm text-slate-500">{reports.length} reports available</span>
          </div>

          {reports.length === 0 ? (
            <p className="text-slate-500">No completed reports yet. Once the doctor analyzes your MRI, the report will appear here.</p>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.report_id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">Report #{report.report_id}</div>
                      <div className="text-xs text-slate-500 mt-1">Doctor: {report.doctor ? (report.doctor.name || report.doctor.email) : `Doctor #${report.doctor_id}`}</div>
                      <div className="text-xs text-slate-500 mt-1">Sent: {report.sent_date ? new Date(report.sent_date).toLocaleString() : "Unknown"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">{Math.round(report.confidence)}%</div>
                      <div className="text-xs text-slate-500">confidence</div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-sm text-slate-700">
                    <div className="bg-blue-50 rounded p-3">
                      <strong>Prediction:</strong> {report.prediction}
                    </div>
                    <div className="bg-slate-50 rounded p-3">
                      <strong>Scan:</strong> {report.file_name || `Scan #${report.scan_id}`}
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
                    <strong>Summary:</strong> {report.summary}
                  </div>

                  <div className="bg-slate-50 rounded p-3 text-sm text-slate-700 whitespace-pre-line">
                    <strong>Recommendation:</strong> {`\n${report.recommendation}`}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3">
                    <Link
                      to={`/results/${report.report_id}`}
                      className="px-4 py-2 rounded-lg border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 text-center"
                    >
                      View Result
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDownload(report)}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                    >
                      Download Report
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
