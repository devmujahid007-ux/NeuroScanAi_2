import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listDoctors, me, runAnalysis, uploadMRI } from "../api";

export default function UploadMRI() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [userRole, setUserRole] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [uploadDoctorId, setUploadDoctorId] = useState("");

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    // Show preview for image types even if upload will be blocked later
    if (selectedFile.type && selectedFile.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setPreviewUrl(null);
    }

    if (!isValidMRIFile(selectedFile)) {
      setMessage("⚠️ Unsupported file type. Please upload a valid MRI file (DICOM/.dcm, .nii). Upload will be blocked until a valid MRI file is chosen.");
      setFile(null);
      return;
    }
    setFile(selectedFile);
    setMessage("");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;
    if (droppedFile.type && droppedFile.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(droppedFile));
    } else {
      setPreviewUrl(null);
    }

    if (!isValidMRIFile(droppedFile)) {
      setMessage("⚠️ Unsupported file type. Please upload a valid MRI file (DICOM/.dcm, .nii). Upload will be blocked until a valid MRI file is chosen.");
      setFile(null);
      return;
    }
    setFile(droppedFile);
    setMessage("");
  };

  const handleDragOver = (e) => e.preventDefault();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await me();
        if (cancelled) return;
        const role = (user.role || "").toLowerCase();
        setUserRole(role);
        if (role === "patient") {
          const list = await listDoctors();
          if (cancelled) return;
          setDoctors(list || []);
          if ((list || []).length === 1) {
            setUploadDoctorId(String(list[0].id));
          }
        }
      } catch {
        if (!cancelled) setUserRole("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpload = async () => {
    if (!file) {
      setMessage("⚠️ Please select a file before uploading.");
      return;
    }

    if (!isValidMRIFile(file)) {
      setMessage("⚠️ Unsupported file type. Please upload a valid MRI file.");
      return;
    }

    const role = (userRole || "").toLowerCase();
    if (role === "patient") {
      if (!doctors.length) {
        setMessage("⚠️ No doctors available. Use the patient dashboard or ask an admin to register a doctor.");
        return;
      }
      if (!uploadDoctorId) {
        setMessage("⚠️ Select which doctor should receive this MRI (required for patients).");
        return;
      }
    }

    setIsUploading(true);
    setProgress(0);
    setMessage("");

    try {
      let prog = 0;
      const interval = setInterval(() => {
        prog += 20;
        setProgress(Math.min(prog, 100));
        if (prog >= 100) clearInterval(interval);
      }, 100);

      const data = await uploadMRI(file, role === "patient" ? uploadDoctorId : null);

      if (role === "doctor" || role === "admin") {
        try {
          await runAnalysis(data.id);
          setMessage("✅ MRI uploaded and analysis started. Scan ID: " + data.id);
        } catch (e) {
          setMessage("✅ MRI uploaded. Analysis could not be started: " + e.message);
        }
      } else {
        setMessage(
          `✅ MRI uploaded and sent to doctor (scan #${data.id}). They will see it under Open requests.`
        );
      }
      setIsUploading(false);
    } catch (err) {
      setIsUploading(false);
      setMessage("❌ Upload failed: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-10 px-6 md:px-10">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm p-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-slate-800">Upload MRI Scan</h2>
          <p className="text-slate-500 mt-1">
            Upload MRI files (DICOM/.dcm or NIfTI/.nii) for AI analysis and report generation.
          </p>
        </div>

        {/* Upload area */}
        <div
          className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-blue-400 transition cursor-pointer"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {!file ? (
            <>
              <svg
                className="mx-auto h-12 w-12 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M12 16v-4m0 0V8m0 4l3 3m-3-3l-3 3m9 4h2a2 2 0 002-2V7a2 2 0 00-2-2h-2M5 19h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <p className="mt-3 text-slate-600">
                Drag & drop your MRI file here, or{" "}
                <label
                  htmlFor="mriUpload"
                  className="text-blue-600 font-semibold cursor-pointer hover:underline"
                >
                  browse
                </label>
              </p>
              <p className="text-xs text-slate-400 mt-1">Supported formats: .dcm, .dicom, .nii, .nii.gz</p>
              <input
                id="mriUpload"
                type="file"
                accept=".dcm,.dicom,.nii,.nii.gz"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          ) : (
            <div className="text-center">
              <p className="text-slate-700 font-medium">
                Selected File: <span className="text-blue-600">{file ? file.name : (previewUrl ? 'Preview file' : '')}</span>
              </p>
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="mx-auto mt-4 rounded-lg w-64 h-64 object-cover shadow-sm"
                />
              )}
            </div>
          )}
        </div>

        {(userRole || "").toLowerCase() === "patient" && doctors.length > 0 && (
          <div className="mt-6">
            <label className="block text-sm text-slate-600 mb-2">
              Doctor to receive this scan <span className="text-red-600">(required)</span>
            </label>
            <select
              value={uploadDoctorId}
              onChange={(e) => setUploadDoctorId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select doctor…</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {(d.name || d.email)} | ID {d.id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Upload progress */}
        {isUploading && (
          <div className="mt-6">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="h-2 bg-blue-600 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Status message */}
        {message && (
          <div
            className={`mt-4 text-sm font-medium ${
              message.includes("✅")
                ? "text-green-600"
                : message.includes("⚠️")
                ? "text-yellow-600"
                : "text-slate-600"
            }`}
          >
            {message}
          </div>
        )}

        {/* Upload button */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isUploading ? "Uploading..." : "Upload MRI"}
          </button>
          <Link
            to="/results"
            className="px-5 py-2 rounded-lg border text-slate-700 font-medium hover:bg-slate-50 transition"
          >
            View Results
          </Link>
        </div>

        {/* Optional patient info */}
        <div className="mt-10 border-t border-slate-200 pt-6">
          <h4 className="text-lg font-semibold text-slate-800 mb-3">
            Patient Information (Optional)
          </h4>
          <form className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Patient Name</label>
              <input
                type="text"
                placeholder="Enter patient name"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Age</label>
              <input
                type="number"
                placeholder="Enter age"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </form>
          <div className="mt-4">
            <label className="block text-sm text-slate-600 mb-1">Notes</label>
            <textarea
              placeholder="Optional notes for the doctor or AI system..."
              rows="3"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  );
}

// Validate file is likely an MRI (by extension or known MIME types)
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
