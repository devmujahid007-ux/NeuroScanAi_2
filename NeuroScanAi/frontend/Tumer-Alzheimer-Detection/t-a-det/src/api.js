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

export async function getRecentAnalyses(limit = 6) {
  const res = await fetch(`${BASE_URL}/api/analyses/recent?limit=${limit}`, { headers: authHeaders() });
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
