import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import { MRI_MODALITIES, uploadMRI, sendScanToDoctor, getPatientScans, getPatientReports, listDoctors } from "../api";

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

const MRI_MODALITY_LABELS = {
  t1c: "T1C",
  t1n: "T1N",
  t2f: "T2F",
  t2w: "T2W",
};

function emptyUploadFiles() {
  return { t1c: null, t1n: null, t2f: null, t2w: null };
}

export default function PatientDashboard() {
  const [scans, setScans] = useState([]);
  const [reports, setReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [uploadFiles, setUploadFiles] = useState(emptyUploadFiles);
  const [uploadDoctorId, setUploadDoctorId] = useState("");
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [scansData, reportsData, doctorsData] = await Promise.all([
          getPatientScans(),
          getPatientReports(),
          listDoctors(),
        ]);
        
        if (mounted) {
          setScans(scansData || []);
          setReports(reportsData || []);
          // Doctors are already filtered from the backend
          setDoctors(doctorsData || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
          console.error("Failed to load data:", err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (doctors.length === 1 && uploadDoctorId === "") {
      setUploadDoctorId(String(doctors[0].id));
    }
  }, [doctors, uploadDoctorId]);

  const handleUploadMRI = async (e) => {
    e.preventDefault();
    const missingModalities = MRI_MODALITIES.filter((modality) => !uploadFiles[modality]);
    if (missingModalities.length > 0) {
      setError(`Please select all 4 MRI files. Missing: ${missingModalities.join(", ")}`);
      return;
    }
    if (doctors.length === 0) {
      setError("No doctors registered. Add a doctor before uploading.");
      return;
    }
    if (!uploadDoctorId) {
      setError("Select which doctor should receive this MRI.");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const newScan = await uploadMRI(uploadFiles, uploadDoctorId);
      setScans([...scans, newScan]);
      setUploadFiles(emptyUploadFiles());
      // Reset form
      for (const modality of MRI_MODALITIES) {
        const fileInput = document.getElementById(`mri-file-input-${modality}`);
        if (fileInput) fileInput.value = "";
      }
      setUploadDoctorId(doctors.length === 1 ? String(doctors[0].id) : "");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSendScan = async (scanId) => {
    if (!selectedDoctor) {
      setError("Please select a doctor");
      return;
    }

    try {
      setSending(true);
      setError(null);
      await sendScanToDoctor(scanId, selectedDoctor);
      
      // Update scan status
      setScans(scans.map(s => s.id === scanId ? { ...s, status: "sent" } : s));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-10 px-6 md:px-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">
            Patient Dashboard
          </h2>
          <p className="text-slate-500 mt-1">
            Upload MRI scans and manage your reports.
          </p>
        </div>

        <div className="flex gap-3 mt-4 md:mt-0 items-center">
          <LogoutButton />
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          title="Total Reports"
          value={reports.length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-6l6-3v6l-6 3zM21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6" />
            </svg>
          }
        />
        <StatCard
          title="Pending Scans"
          value={scans.filter(s => s.status === "pending").length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 5v14M5 12h14" />
            </svg>
          }
        />
        <StatCard
          title="Sent Scans"
          value={scans.filter(s => s.status === "sent").length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 19l9 2-9-18-9 18 9-2m0 0v-8m0 8l-6-4m6 4l6-4" />
            </svg>
          }
        />
        <StatCard
          title="AI Accuracy"
          value="94%"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" />
            </svg>
          }
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* MRI Upload Section */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Upload MRI Scan</h3>
          
          <form onSubmit={handleUploadMRI} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MRI_MODALITIES.map((modality) => (
                <div key={modality} className="border-2 border-dashed border-blue-300 rounded-lg p-5 text-center hover:border-blue-500 transition">
                  <input
                    id={`mri-file-input-${modality}`}
                    type="file"
                    accept=".dcm,.dicom,.nii,.nii.gz"
                    onChange={(e) => setUploadFiles((prev) => ({ ...prev, [modality]: e.target.files?.[0] || null }))}
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
            <div className="text-sm text-slate-500">Upload 4 MRI modalities: T1C, T1N, T2F, and T2W.</div>

            <div>
              <label className="text-sm text-slate-600 block mb-2">Doctor (required)</label>
              <select
                value={uploadDoctorId}
                onChange={(e) => setUploadDoctorId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select doctor…</option>
                {doctors.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.email} (ID: {doc.id})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={uploading || MRI_MODALITIES.some((modality) => !uploadFiles[modality]) || doctors.length === 0 || !uploadDoctorId}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload & send to doctor"}
            </button>
          </form>
        </div>

        {/* Sent Scans Section */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Send MRI to Doctor</h3>
          
          {scans.length === 0 ? (
            <p className="text-slate-500">No MRI scans uploaded yet.</p>
          ) : (
            <div className="space-y-4">
              {scans.filter(s => s.status === "pending").map((scan) => (
                <div key={scan.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-medium text-slate-800">Scan #{scan.id}</div>
                      <div className="text-xs text-slate-500">
                        Uploaded: {new Date(scan.upload_date).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Status: <span className="inline-block px-2 py-1 rounded bg-yellow-100 text-yellow-800">{scan.status}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-slate-600 block mb-2">Select Doctor:</label>
                      <select
                        value={selectedDoctor || ""}
                        onChange={(e) => setSelectedDoctor(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a doctor...</option>
                        {doctors.map((doc) => (
                          <option key={doc.id} value={doc.id}>
                            {doc.email} (ID: {doc.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => handleSendScan(scan.id)}
                      disabled={sending || !selectedDoctor}
                      className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? "Sending..." : "Send to Doctor"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Scans Status */}
        {scans.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">All Scans</h3>
            <div className="space-y-2">
              {scans.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Scan #{scan.id}</div>
                    <div className="text-xs text-slate-500">{new Date(scan.upload_date).toLocaleDateString()}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    scan.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                    scan.status === "sent" ? "bg-blue-100 text-blue-800" :
                    scan.status === "analyzed" ? "bg-purple-100 text-purple-800" :
                    "bg-green-100 text-green-800"
                  }`}>
                    {scan.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports Section */}
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Available Reports</h3>
          
          {reports.length === 0 ? (
            <p className="text-slate-500">No reports available yet. Upload and send scans to doctors for analysis.</p>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.report_id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">Report #{report.report_id}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Sent: {new Date(report.sent_date).toLocaleString()}
                      </div>
                      <div className="text-sm text-slate-700 mt-2">
                        <strong>Prediction:</strong> {report.prediction}
                      </div>
                      <div className="text-sm text-slate-700 mt-1">
                        <strong>Confidence:</strong> {(report.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {(report.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 rounded p-3 text-sm text-slate-700">
                    <strong>Summary:</strong> {report.summary}
                  </div>

                  <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
                    <strong>Recommendations:</strong> {report.recommendation}
                  </div>

                  <button className="w-full px-4 py-2 rounded-lg border border-blue-600 text-blue-600 font-medium hover:bg-blue-50">
                    Download Report
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tips Section */}
      <div className="bg-blue-50 rounded-2xl p-6 mt-10 border border-blue-100">
        <h4 className="text-lg font-semibold text-blue-800 mb-2">💡 Health Tips</h4>
        <ul className="text-sm text-blue-900 space-y-2 list-disc pl-5">
          <li>Upload DICOM or NIfTI format MRI scans from your medical imaging files.</li>
          <li>Select a doctor from the list to send your scans for analysis.</li>
          <li>Check back regularly to view reports once the doctor completes the analysis.</li>
        </ul>
      </div>
    </div>
  );
}
