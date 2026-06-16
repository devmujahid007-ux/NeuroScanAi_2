export const BASE_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

/** FastAPI may return detail as string, object, or array — normalize for Error.message */
export function parseFastApiDetail(body) {
  if (!body || body.detail == null) return null;
  const d = body.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d
      .map((e) => (e && typeof e === "object" && "msg" in e ? e.msg : String(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (typeof d === "object" && "msg" in d) return String(d.msg);
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}

export function absoluteUrl(path) {
  if (!path) return null;
  return path.startsWith("http") ? path : `${BASE_URL}${path}`;
}

export const MRI_MODALITIES = ["t1c", "t1n", "t2f", "t2w"];

export function authHeaders() {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** For binary GETs (PDF, images): avoid forcing JSON Content-Type on the request. */
export function authBearerHeaders() {
  const token = localStorage.getItem("token");
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * URL to open a stored report PDF in the browser (inline) or download (?download=true).
 * Uses access_token query so window.open works without Authorization header.
 */
export function reportPdfOpenUrl(reportId, { download = false } = {}) {
  const id = Number(reportId);
  if (!id) return null;
  const token = localStorage.getItem("token") || "";
  const q = new URLSearchParams();
  if (download) q.set("download", "true");
  if (token) q.set("access_token", token);
  const qs = q.toString();
  return `${BASE_URL}/reports/${id}${qs ? `?${qs}` : ""}`;
}

/** List PDF reports for the logged-in doctor or patient (GET /reports). */
export async function listReports() {
  const res = await fetch(`${BASE_URL}/reports`, { headers: authHeaders() });
  if (!res.ok) {
    let msg = "Failed to load reports";
    try {
      const body = await res.json();
      msg = parseFastApiDetail(body) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Load a report PDF from a path or absolute URL (e.g. /uploads/reports/...).
 * Forces application/pdf so browsers render it inline in iframes/embeds reliably.
 */
export async function fetchReportPdfBlob(relativeOrAbsoluteUrl) {
  const url = absoluteUrl(relativeOrAbsoluteUrl);
  if (!url) throw new Error("No report URL");
  const res = await fetch(url, { headers: authBearerHeaders() });
  if (!res.ok) throw new Error("Failed to load report PDF");
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "application/pdf" });
}

/**
 * Load report PDF via API (no ``.pdf`` in URL path) so download managers do not grab View/preview requests.
 */
export async function fetchReportPdfBlobByReportId(reportId) {
  const id = Number(reportId);
  if (!id) throw new Error("Invalid report id");
  const res = await fetch(`${BASE_URL}/reports/${id}`, { headers: authBearerHeaders() });
  if (!res.ok) throw new Error("Failed to load report PDF");
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "application/pdf" });
}

export function logout() {
  localStorage.removeItem("token");
}

export async function login(email, password,role) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Login failed");
  return res.json();
}

export async function registerUser(payload) {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Registration failed");
  return res.json();
}

export async function createAdmin(email, password) {
  const res = await fetch(`${BASE_URL}/auth/create-admin`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password, role: "admin" }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Create admin failed");
  return res.json();
}

export async function me() {
  const res = await fetch(`${BASE_URL}/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

/** Public feed for the marketing home page (no JWT required; backend allows unauthenticated GET). */
export async function getRecentAnalyses(limit = 6) {
  const res = await fetch(`${BASE_URL}/api/analyses/recent?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load recent analyses");
  return res.json();
}

export async function getDashboardStats() {
  const res = await fetch(`${BASE_URL}/api/stats/summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load dashboard stats");
  return res.json();
}

export async function listPatients() {
  const res = await fetch(`${BASE_URL}/api/patients/`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to list patients");
  return res.json();
}

export async function listDoctors() {
  const res = await fetch(`${BASE_URL}/api/patients/doctors`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to list doctors");
  return res.json();
}

export async function createDoctor(payload) {
  const res = await fetch(`${BASE_URL}/api/patients/doctors`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to create doctor");
  return res.json();
}

export async function deleteDoctor(doctorId) {
  const res = await fetch(`${BASE_URL}/api/patients/doctors/${doctorId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to delete doctor");
  return res.json();
}

export async function inviteUser(payload) {
  const res = await fetch(`${BASE_URL}/api/patients/invite`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to invite user");
  return res.json();
}

export async function createPatient(payload) {
  const res = await fetch(`${BASE_URL}/api/patients/`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to create patient");
  return res.json();
}

export async function getPatient(patientId) {
  const res = await fetch(`${BASE_URL}/api/patients/${patientId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load patient");
  return res.json();
}

export async function updatePatient(patientId, payload) {
  const res = await fetch(`${BASE_URL}/api/patients/${patientId}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to update patient");
  return res.json();
}

export async function deletePatient(patientId) {
  const res = await fetch(`${BASE_URL}/api/patients/${patientId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete patient");
  return res.json();
}

export async function getAnalysis(reportId) {
  const res = await fetch(`${BASE_URL}/api/analyses/${reportId}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load analysis");
  return res.json();
}

export async function runAnalysis(scanId) {
  const res = await fetch(`${BASE_URL}/api/analyses/run`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ scan_id: scanId }),
  });
  if (!res.ok) {
    let msg = "Failed to run analysis";
    try {
      const body = await res.json();
      msg = parseFastApiDetail(body) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Generates PDF on server; response is JSON (not PDF) so download tools do not grab the POST.
 * @param {{ scan_id: number, patient_id: number, patient_name?: string|null, age?: number|null, gender?: string|null }} payload
 * @returns {Promise<{ reportId: string|number|null, message: string|null }>}
 */
export async function generateSegmentationReport(payload) {
  const res = await fetch(`${BASE_URL}/api/generate-report`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = "Failed to generate report";
    try {
      const body = await res.json();
      msg = parseFastApiDetail(body) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  const reportId = data.report_id != null ? data.report_id : null;
  const message = data.message != null ? data.message : null;
  return {
    reportId,
    message,
    pdfPending: Boolean(data.pdf_pending),
    findings_paragraph: data.findings_paragraph != null ? String(data.findings_paragraph) : null,
    analysis_paragraph: data.analysis_paragraph != null ? String(data.analysis_paragraph) : null,
    conclusion_paragraph: data.conclusion_paragraph != null ? String(data.conclusion_paragraph) : null,
    probs_paragraph: data.probs_paragraph != null ? String(data.probs_paragraph) : null,
    disclaimer_text: data.disclaimer_text != null ? String(data.disclaimer_text) : null,
    scan_kind: data.scan_kind != null ? String(data.scan_kind) : null,
  };
}

/**
 * Renders the PDF on the server after the doctor edits draft text from generate-report (skip_pdf).
 * @param {{ report_id: number, findings_paragraph: string, analysis_paragraph: string, probs_paragraph?: string|null }} payload
 */
export async function finalizeReportPdf(payload) {
  const body = {
    report_id: Number(payload.report_id),
    findings_paragraph: payload.findings_paragraph,
    analysis_paragraph: payload.analysis_paragraph,
  };
  if (payload.probs_paragraph !== undefined) {
    body.probs_paragraph = payload.probs_paragraph;
  }
  const res = await fetch(`${BASE_URL}/api/finalize-report-pdf`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "Failed to finalize report PDF";
    try {
      const errBody = await res.json();
      msg = parseFastApiDetail(errBody) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function sendReportToPatient(reportId, patientId) {
  const res = await fetch(`${BASE_URL}/api/send-report`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: Number(reportId), patient_id: Number(patientId) }),
  });
  if (!res.ok) {
    let msg = "Failed to send report";
    try {
      const body = await res.json();
      msg = parseFastApiDetail(body) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function viewModelResult(scanId) {
  const res = await fetch(`${BASE_URL}/api/analyses/view-result`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ scan_id: scanId }),
  });
  if (!res.ok) {
    let detail = "View result failed";
    try {
      const body = await res.json();
      detail = parseFastApiDetail(body) || detail;
    } catch {
      /* ignore */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function viewAlzheimerLocalResult(scanId, imageFile) {
  const fd = new FormData();
  fd.append("scan_id", String(scanId));
  fd.append("image", imageFile);
  const res = await fetch(`${BASE_URL}/api/analyses/alz-view-local`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: fd,
  });
  if (!res.ok) {
    let detail = "View result failed";
    try {
      const body = await res.json();
      detail = parseFastApiDetail(body) || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

function appendMriModalities(formData, filesByModality) {
  for (const modality of MRI_MODALITIES) {
    const file = filesByModality?.[modality];
    if (file) formData.append(modality, file);
  }
}

export async function replaceScanFile(scanId, filesByModality) {
  const fd = new FormData();
  appendMriModalities(fd, filesByModality);
  const res = await fetch(`${BASE_URL}/mri/scan/${scanId}/replace-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: fd,
  });
  if (!res.ok) {
    let detail = "Replace file failed";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function downloadPatientScanBlob(scanId) {
  const res = await fetch(`${BASE_URL}/mri/scan/${scanId}/download`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  if (!res.ok) {
    let detail = "Download failed";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const cd = res.headers.get("Content-Disposition");
  let filename = `scan_${scanId}.dat`;
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
    if (m) filename = decodeURIComponent(m[1].replace(/["']/g, ""));
  }
  const blob = await res.blob();
  return { blob, filename };
}

export function streamAnalyses(onMessage) {
  try {
    const es = new EventSource(`${BASE_URL}/api/analyses/stream`);
    es.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data);
        onMessage && onMessage(payload);
      } catch {}
    };
    es.onerror = () => {
      try { es.close(); } catch {}
    };
    return es;
  } catch (e) {
    return null;
  }
}

// ========== MRI Upload & Patient-Doctor Workflow ==========

export async function uploadMRI(filesByModality, doctorId = null) {
  const formData = new FormData();
  appendMriModalities(formData, filesByModality);
  const idNum = doctorId != null && doctorId !== "" ? Number(doctorId) : NaN;
  if (Number.isFinite(idNum) && idNum > 0) {
    formData.append("doctor_id", String(idNum));
  }

  const res = await fetch(`${BASE_URL}/mri/upload`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
    body: formData,
  });
  if (!res.ok) {
    let detail = "MRI upload failed";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail) || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

/** Patient accounts: single ZIP with t1c/t1n/t2f/t2w (.nii or .nii.gz) anywhere in the archive. */
export async function uploadPatientMriZip(zipFile, doctorId) {
  const formData = new FormData();
  formData.append("mri_zip", zipFile);
  const idNum = doctorId != null && doctorId !== "" ? Number(doctorId) : NaN;
  if (Number.isFinite(idNum) && idNum > 0) {
    formData.append("doctor_id", String(idNum));
  }
  const auth = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  let res = await fetch(`${BASE_URL}/mri/upload-zip`, {
    method: "POST",
    headers: auth,
    body: formData,
  });
  // Older backends only expose POST /mri/upload — rebuild FormData (body consumed after send).
  if (res.status === 404) {
    const fd2 = new FormData();
    fd2.append("mri_zip", zipFile);
    if (Number.isFinite(idNum) && idNum > 0) {
      fd2.append("doctor_id", String(idNum));
    }
    res = await fetch(`${BASE_URL}/mri/upload`, {
      method: "POST",
      headers: auth,
      body: fd2,
    });
  }
  if (!res.ok) {
    let detail = "MRI ZIP upload failed";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail) || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

/** Patient: single PNG/JPEG for Alzheimer detection (queued to doctor; separate from tumor ZIP flow). */
export async function uploadPatientAlzImage(imageFile, doctorId) {
  const formData = new FormData();
  formData.append("image", imageFile);
  const idNum = doctorId != null && doctorId !== "" ? Number(doctorId) : NaN;
  if (Number.isFinite(idNum) && idNum > 0) {
    formData.append("doctor_id", String(idNum));
  }
  const res = await fetch(`${BASE_URL}/mri/upload-alz-image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: formData,
  });
  if (!res.ok) {
    let detail = "Alzheimer image upload failed";
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail) || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function sendScanToDoctor(scanId, doctorId) {
  const res = await fetch(`${BASE_URL}/mri/send-to-doctor/${scanId}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ doctor_id: doctorId }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to send scan to doctor");
  return res.json();
}

export async function getPatientScans() {
  const res = await fetch(`${BASE_URL}/mri/patient-scans`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load patient scans");
  return res.json();
}

/** Remove a tumor (MRI) request for the patient and doctor (DB + files). Alzheimer scans are rejected by the API. */
export async function deletePatientTumorScan(scanId) {
  const id = Number(scanId);
  if (!id) throw new Error("Invalid scan");
  const res = await fetch(`${BASE_URL}/mri/patient-scans/${id}`, {
    method: "DELETE",
    headers: authBearerHeaders(),
  });
  if (!res.ok) {
    let detail = "Could not delete request";
    try {
      const body = await res.json();
      detail = parseFastApiDetail(body) || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function getDoctorRequests() {
  const res = await fetch(`${BASE_URL}/mri/doctor-requests`, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to load doctor requests");
  return res.json();
}

export async function getMriPreviewMeta(scanId) {
  const res = await fetch(`${BASE_URL}/mri/scan/${scanId}/preview-meta`, { headers: authHeaders() });
  if (!res.ok) {
    let detail = "Failed to load MRI preview info";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function fetchMriPreviewBlob(scanId, sliceIndex) {
  const u = new URL(`${BASE_URL}/mri/scan/${scanId}/preview`);
  if (sliceIndex != null && sliceIndex >= 0) u.searchParams.set("slice_index", String(sliceIndex));
  const res = await fetch(u.toString(), {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  });
  if (!res.ok) {
    let detail = "Could not load MRI slice";
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.blob();
}

export async function sendReport(scanId) {
  const res = await fetch(`${BASE_URL}/api/analyses/send-report/${scanId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to send report");
  return res.json();
}

export async function getPatientReports() {
  const res = await fetch(`${BASE_URL}/api/analyses/patient-reports`, { headers: authHeaders() });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to load reports");
  return res.json();
}

export async function predictTumorSegmentation(filesByModality) {
  const formData = new FormData();
  for (const modality of MRI_MODALITIES) {
    const file = filesByModality?.[modality];
    if (!file) {
      throw new Error(`Missing required file: ${modality}`);
    }
    formData.append(modality, file);
  }

  const res = await fetch(`${BASE_URL}/predict`, {
    method: "POST",
    body: formData,
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const detail = (body && (body.error || parseFastApiDetail(body))) || "Prediction failed";
    throw new Error(detail);
  }

  return body;
}
