import React, { useEffect, useMemo, useState } from "react";
import {
  createDoctor,
  createPatient,
  deleteDoctor,
  deletePatient,
  listDoctors,
  listPatients,
} from "../api";

const StatCard = ({ title, value, icon }) => (
  <div className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-4">
    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
      {icon}
    </div>
    <div className="flex-1">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-0.5 text-2xl font-bold text-slate-800">{value}</div>
    </div>
  </div>
);

const initialForm = {
  role: "patient",
  name: "",
  email: "",
  phone: "",
  age: "",
  password: "",
};

export default function AdminDashboard() {
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

  const totalUsers = patients.length + doctors.length;

  const filteredPatients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      [p.name, p.email, p.phone].some((field) => String(field || "").toLowerCase().includes(q))
    );
  }, [patients, query]);

  const filteredDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) =>
      [d.name, d.email, d.phone].some((field) => String(field || "").toLowerCase().includes(q))
    );
  }, [doctors, query]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [patientsData, doctorsData] = await Promise.all([listPatients(), listDoctors()]);
      setPatients(patientsData || []);
      setDoctors(doctorsData || []);
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!form.password || String(form.password).length < 6) {
      setError("Password is required and must be at least 6 characters so the user can sign in.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      setNotice(null);

      if (form.role === "doctor") {
        const result = await createDoctor({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password,
        });
        const temp = result?.temporary_password ? ` Temporary password: ${result.temporary_password}` : "";
        setNotice(`Doctor added successfully.${temp}`);
      } else {
        await createPatient({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          age: form.age !== "" ? Number(form.age) : null,
          password: form.password,
        });
        setNotice("Patient added successfully. They can sign in with this email and password.");
      }

      setForm(initialForm);
      await loadData();
    } catch (err) {
      setError(err.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(role, id, name) {
    const ok = window.confirm(`Delete ${role} "${name || `#${id}`}"? This updates the database.`);
    if (!ok) return;
    try {
      setError(null);
      setNotice(null);
      if (role === "doctor") {
        await deleteDoctor(id);
      } else {
        await deletePatient(id);
      }
      setNotice(`${role === "doctor" ? "Doctor" : "Patient"} deleted successfully.`);
      await loadData();
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading admin dashboard...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-8 px-6 md:px-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Admin Dashboard</h2>
          <p className="text-slate-500 mt-1">
            Manage doctors and patients: add users, invite users, delete users, and view complete user lists.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Patients"
          value={patients.length}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 12a5 5 0 100-10 5 5 0 000 10zm-7 9a7 7 0 0114 0" /></svg>}
        />
        <StatCard
          title="Doctors"
          value={doctors.length}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a4 4 0 00-5.656 0M7 11a4 4 0 100-8 4 4 0 000 8zm0 0v10m0 0H3m4 0h4" /></svg>}
        />
        <StatCard
          title="Total Users"
          value={totalUsers}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10h.01M13 16h2v2l-1 1h-1l-1-1v-2zm-4-4h2v2H9v-2z" /></svg>}
        />
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">{error}</div>}
      {notice && <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700">{notice}</div>}

      <section className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white"
          >
            Add User
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm text-slate-600 block mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => updateForm("role", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-600 block mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => updateForm("name", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="text-sm text-slate-600 block mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm("email", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="user@email.com"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-sm text-slate-600 block mb-1">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => updateForm("phone", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Optional"
            />
          </div>
          {form.role === "patient" ? (
            <div>
              <label className="text-sm text-slate-600 block mb-1">Age</label>
              <input
                type="number"
                min="0"
                value={form.age}
                onChange={(e) => updateForm("age", e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Optional"
              />
            </div>
          ) : (
            <div className="hidden lg:block" aria-hidden="true" />
          )}
          <div>
            <label className="text-sm text-slate-600 block mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateForm("password", e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
            <p className="text-xs text-slate-500 mt-1">User signs in with this email and password.</p>
          </div>
          <div className="flex items-end md:col-span-2 lg:col-span-3 lg:justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="w-full md:w-auto min-w-[200px] px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Add User"}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-slate-800">All Users</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone..."
            className="px-3 py-2 border rounded-lg text-sm w-full md:w-80"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div>
            <h4 className="font-semibold text-slate-800 mb-3">Patients ({filteredPatients.length})</h4>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-slate-50 border-b">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="px-3 py-2">{p.name || `Patient #${p.id}`}</td>
                      <td className="px-3 py-2">{p.email}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteUser("patient", p.id, p.name)}
                          className="px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredPatients.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-3 py-6 text-center text-slate-500">No patients found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-slate-800 mb-3">Doctors ({filteredDoctors.length})</h4>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left bg-slate-50 border-b">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDoctors.map((d) => (
                    <tr key={d.id} className="border-b">
                      <td className="px-3 py-2">{d.name || `Doctor #${d.id}`}</td>
                      <td className="px-3 py-2">{d.email}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteUser("doctor", d.id, d.name)}
                          className="px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredDoctors.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-3 py-6 text-center text-slate-500">No doctors found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
