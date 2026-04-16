import React, { useState, useEffect } from "react";
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

export default function PatientDashboard() {
  const [scans, setScans] = useState([]);
  const [reports, setReports] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [zipFile, setZipFile] = useState(null);
  const [uploadDoctorId, setUploadDoctorId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [scansData, reportsData, doctorsData] = await Promise.all([
          getPatientScans(),
          listReports(),
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
    if (!zipFile) {
      setError("Choose a ZIP that includes your MRI volumes.");
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
      const newScan = await uploadPatientMriZip(zipFile, uploadDoctorId);
      setScans([...scans, newScan]);
      setZipFile(null);
      const input = document.getElementById("mri-zip-input");
      if (input) input.value = "";
      setUploadDoctorId(doctors.length === 1 ? String(doctors[0].id) : "");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
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
          title="My scans"
          value={scans.length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          }
        />
        <StatCard
          title="With doctor"
          value={scans.filter((s) => s.status === "sent" || s.status === "analyzed").length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586A1 1 0 0113.293 3.293l4.414 4.414A1 1 0 0118 8.414V19a2 2 0 01-2 2z" />
            </svg>
          }
        />
        <StatCard
          title="Reports"
          value={reports.length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          title="Not assigned"
          value={scans.filter((s) => s.status === "pending").length}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Upload MRI (ZIP)</h3>

          <form onSubmit={handleUploadMRI} className="space-y-4">
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center hover:border-blue-500 transition">
              <input
                id="mri-zip-input"
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <label htmlFor="mri-zip-input" className="cursor-pointer block">
                <div className="text-blue-600 mb-2">
                  <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-slate-800 font-medium">One .zip with your MRI volumes (.nii / .nii.gz)</div>
                <div className="text-sm text-slate-500 mt-1 break-all">
                  {zipFile ? zipFile.name : "Choose ZIP"}
                </div>
              </label>
            </div>

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
              disabled={uploading || !zipFile || doctors.length === 0 || !uploadDoctorId}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Uploading..." : "Upload ZIP & send to doctor"}
            </button>
          </form>
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
            <p className="text-slate-500">No reports available yet. Upload a ZIP and your doctor will share a report when ready.</p>
          ) : (
            <div className="space-y-4">
              {reports.map((report) => (
                <div key={report.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">Report #{report.id}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        {report.created_at ? new Date(report.created_at).toLocaleString() : "—"}
                      </div>
                      <div className="text-sm text-slate-700 mt-2">
                        <strong>Prediction:</strong> {report.prediction || "—"}
                      </div>
                      <div className="text-sm text-slate-700 mt-1">
                        <strong>Confidence:</strong>{" "}
                        {report.confidence != null ? `${Math.round(report.confidence)}%` : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">
                        {report.confidence != null ? `${Math.round(report.confidence)}%` : "—"}
                      </div>
                    </div>
                  </div>

                  {report.summary ? (
                    <div className="bg-blue-50 rounded p-3 text-sm text-slate-700">
                      <strong>Summary:</strong> {report.summary}
                    </div>
                  ) : null}

                  {report.recommendation ? (
                    <div className="bg-slate-50 rounded p-3 text-sm text-slate-700">
                      <strong>Recommendations:</strong> {report.recommendation}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                    onClick={() => {
                      const url = reportPdfOpenUrl(report.id, { download: false });
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Open PDF
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
          <li>Use one ZIP with at least four NIfTI files; exact filenames are optional if the zip contains exactly four volumes.</li>
          <li>Pick your doctor before uploading; the case goes to their dashboard immediately.</li>
          <li>Open PDF reports in the browser from this page when your doctor shares them.</li>
        </ul>
      </div>
    </div>
  );
}
