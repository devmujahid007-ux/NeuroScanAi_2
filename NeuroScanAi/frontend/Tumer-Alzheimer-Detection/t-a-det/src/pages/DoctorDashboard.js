import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";
import { getDoctorRequests, runAnalysis, sendReport, me, BASE_URL } from "../api";

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

export default function DoctorDashboard() {
  const [requests, setRequests] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyzingScans, setAnalyzingScans] = useState(new Set());
  const [sendingReports, setSendingReports] = useState(new Set());

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        const [userData, requestsData] = await Promise.all([
          me(),
          getDoctorRequests(),
        ]);
        
        if (mounted) {
          setCurrentUser(userData);
          setRequests(requestsData || []);
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

  const handleRunAnalysis = async (scanId) => {
    try {
      setAnalyzingScans(prev => new Set(prev).add(scanId));
      setError(null);
      
      await runAnalysis(scanId);
      
      // Update request status
      setRequests(requests.map(r => 
        r.id === scanId ? { ...r, status: "analyzed" } : r
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzingScans(prev => {
        const next = new Set(prev);
        next.delete(scanId);
        return next;
      });
    }
  };

  const handleSendReport = async (scanId) => {
    try {
      setSendingReports(prev => new Set(prev).add(scanId));
      setError(null);
      
      await sendReport(scanId);
      
      // Update request status
      setRequests(requests.map(r => 
        r.id === scanId ? { ...r, status: "reported" } : r
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingReports(prev => {
        const next = new Set(prev);
        next.delete(scanId);
        return next;
      });
    }
  };

  const sentRequests = requests.filter(r => r.status === "sent");
  const analyzedRequests = requests.filter(r => r.status === "analyzed");
  const reportedRequests = requests.filter(r => r.status === "reported");

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-8 px-4 md:px-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-800">Doctor Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Review patient MRI scans, run analysis, and generate reports.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <LogoutButton />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Pending Analysis"
          value={sentRequests.length}
          subtitle="Awaiting your analysis"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Completed Analysis"
          value={analyzedRequests.length}
          subtitle="Ready to send reports"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          title="Reports Sent"
          value={reportedRequests.length}
          subtitle="Delivered to patients"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 19l9 2-9-18-9 18 9-2m0 0v-8m0 8l-6-4m6 4l6-4" />
            </svg>
          }
        />
        <StatCard
          title="Total Requests"
          value={requests.length}
          subtitle="All patient submissions"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10h.01M13 16h2v2l-1 1h-1l-1-1v-2zm-4-4h2v2H9v-2zm0 4h2v2H9v-2z" />
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
        {/* Pending Analysis Section */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Pending Analysis</h2>
            <span className="text-sm text-slate-500">{sentRequests.length} requests</span>
          </div>

          {sentRequests.length === 0 ? (
            <p className="text-slate-500">No pending requests. All requests are being processed.</p>
          ) : (
            <div className="space-y-4">
              {sentRequests.map((request) => (
                <div key={request.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Scan #{request.id}</div>
                      <div className="text-xs text-slate-500">
                        Patient ID: {request.patient_id} • Uploaded: {new Date(request.upload_date).toLocaleString()}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Status: <span className="inline-block px-2 py-1 rounded bg-blue-100 text-blue-800 font-medium">{request.status}</span>
                      </div>
                    </div>
                  </div>

                  {request.file_path && (
                    <div className="bg-slate-50 rounded p-3 text-sm text-slate-600">
                      <strong>File:</strong> {request.file_path.split('/').pop() || 'MRI Scan'}
                    </div>
                  )}

                  <button
                    onClick={() => handleRunAnalysis(request.id)}
                    disabled={analyzingScans.has(request.id)}
                    className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {analyzingScans.has(request.id) ? "Running Analysis..." : "Run Analysis"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Analyzed Requests Section */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Completed Analysis</h2>
            <span className="text-sm text-slate-500">{analyzedRequests.length} completed</span>
          </div>

          {analyzedRequests.length === 0 ? (
            <p className="text-slate-500">No completed analysis yet.</p>
          ) : (
            <div className="space-y-4">
              {analyzedRequests.map((request) => (
                <div key={request.id} className="border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800">Scan #{request.id}</div>
                      <div className="text-xs text-slate-500">
                        Patient ID: {request.patient_id}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Status: <span className="inline-block px-2 py-1 rounded bg-green-100 text-green-800 font-medium">{request.status}</span>
                      </div>
                    </div>
                  </div>

                  {request.diagnosis && (
                    <div className="bg-white rounded p-3 text-sm space-y-2">
                      <div><strong>Prediction:</strong> {request.diagnosis.prediction || "N/A"}</div>
                      <div><strong>Confidence:</strong> {request.diagnosis.confidence ? (request.diagnosis.confidence * 100).toFixed(1) + "%" : "N/A"}</div>
                      {request.diagnosis.report && (
                        <>
                          <div><strong>Summary:</strong> {request.diagnosis.report.summary}</div>
                          <div><strong>Recommendation:</strong> {request.diagnosis.report.recommendation}</div>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleSendReport(request.id)}
                    disabled={sendingReports.has(request.id)}
                    className="w-full px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingReports.has(request.id) ? "Sending..." : "Send Report to Patient"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reports Sent Section */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Reports Sent</h2>
            <span className="text-sm text-slate-500">{reportedRequests.length} sent</span>
          </div>

          {reportedRequests.length === 0 ? (
            <p className="text-slate-500">No reports sent yet.</p>
          ) : (
            <div className="space-y-2">
              {reportedRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-sm font-medium text-slate-800">Scan #{request.id}</div>
                    <div className="text-xs text-slate-500">Patient ID: {request.patient_id}</div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Reported
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Quick Notes */}
      <div className="bg-blue-50 rounded-2xl shadow-sm p-5 mt-6 border border-blue-100">
        <h3 className="text-lg font-semibold text-slate-800 mb-3">📋 Workflow Summary</h3>
        <ul className="mt-3 text-sm text-slate-600 space-y-2">
          <li>✓ <strong>1. View Requests:</strong> Check pending MRI scans from patients</li>
          <li>✓ <strong>2. Run Analysis:</strong> Process scans using AI models</li>
          <li>✓ <strong>3. Generate Report:</strong> System auto-generates analysis summary</li>
          <li>✓ <strong>4. Send Report:</strong> Deliver results back to patient</li>
        </ul>
      </div>
    </div>
  );
}
