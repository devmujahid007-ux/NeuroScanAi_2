import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import LogoutButton from "../components/LogoutButton";


// ---- Reusable bits ---------------------------------------------------------
const StatCard = ({ title, value, delta, icon }) => (
  <div className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-4">
    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
      {icon}
    </div>
    <div className="flex-1">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-0.5 text-2xl font-bold text-slate-800">{value}</div>
      {delta && (
        <div
          className={
            "text-xs mt-1 " +
            (delta.startsWith("+") ? "text-emerald-600" : "text-rose-600")
          }
        >
          {delta} from last week
        </div>
      )}
    </div>
  </div>
);

const Pill = ({ children, tone = "slate" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
};

// ---- Main ------------------------------------------------------------------
export default function AdminDashboard() {
  // Mock data (replace with API calls later)
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [logFilter, setLogFilter] = useState("All");
  const [candidateVersion, setCandidateVersion] = useState("v3.3.0");
  const [changelog, setChangelog] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const users = [
    { name: "Dr. Alice Johnson", role: "Doctor", email: "alice@neuroscan.ai", status: "Active" },
    { name: "John Doe", role: "Patient", email: "john@example.com", status: "Active" },
    { name: "Dr. Smith", role: "Admin", email: "smith@neuroscan.ai", status: "Suspended" },
    { name: "Mehak Noor", role: "Patient", email: "mehak@example.com", status: "Active" },
  ];

  const logs = [
    { ts: "2025-11-09 09:42", sev: "INFO", msg: "Daily backup completed" },
    { ts: "2025-11-09 09:15", sev: "WARN", msg: "Queue depth high: upload-processing" },
    { ts: "2025-11-09 08:57", sev: "ERROR", msg: "Failed to fetch model weights from cache" },
    { ts: "2025-11-08 22:04", sev: "INFO", msg: "Report R-2091 generated" },
  ];

  const stats = [
    {
      title: "Total Users",
      value: "128",
      delta: "+6",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2h5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8a4 4 0 110-8 4 4 0 010 8z" />
        </svg>
      ),
    },
    {
      title: "Active Models",
      value: "2",
      delta: "+0",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" strokeWidth="1.5" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 7v5l4 2" />
        </svg>
      ),
    },
    {
      title: "Reports Processed",
      value: "467",
      delta: "+31",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    {
      title: "System Alerts",
      value: "3",
      delta: "-2",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4m0 4h.01M21 12A9 9 0 113 12a9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  // Derived lists
  const filteredUsers = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === "All" || u.role === roleFilter;
      const matchesQuery =
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      return matchesRole && matchesQuery;
    });
  }, [users, query, roleFilter]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => logFilter === "All" || l.sev === logFilter);
  }, [logs, logFilter]);

  // Check whether current user is superadmin to show create-admin controls
  useEffect(() => {
    let mounted = true;
    import("../api").then(({ me }) =>
      me()
        .then((u) => mounted && setIsSuper((u.role || "").toLowerCase() === "superadmin"))
        .catch(() => mounted && setIsSuper(false))
    );
    return () => (mounted = false);
  }, []);

  const createAdmin = async () => {
    if (!newAdminEmail || !newAdminPassword) return alert("Enter email and password");
    setCreatingAdmin(true);
    try {
      const { createAdmin: createAdminApi } = await import("../api");
      await createAdminApi(newAdminEmail, newAdminPassword);
      alert("Admin user created successfully");
      setNewAdminEmail("");
      setNewAdminPassword("");
    } catch (err) {
      console.error(err);
      alert(err?.message || "Failed to create admin");
    } finally {
      setCreatingAdmin(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-8 px-6 md:px-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">Admin Dashboard</h2>
          <p className="text-slate-500 mt-1">
            Manage users, monitor logs, view stats, and update the model.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-slate-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6" />
            </svg>
            Home
          </Link>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 5v14M5 12h14" />
            </svg>
            Invite User
          </button>
          {/* Logout */}
          <LogoutButton />
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Users + Logs (2 cols) */}
        <section className="xl:col-span-2 space-y-6">
          {/* Manage Users */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Manage Users</h3>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, email, or role…"
                  className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option>All</option>
                  <option>Admin</option>
                  <option>Doctor</option>
                  <option>Patient</option>
                </select>
                <button className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">
                  Export CSV
                </button>
              </div>
            </div>

          {isSuper && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="text-lg font-semibold text-slate-800">Super Admin — Create Admin</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">Admin Email</label>
                  <input
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="admin@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-600 mb-1">Password</label>
                  <input
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    type="password"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="strong password"
                  />
                </div>

                <div className="flex gap-2">
                  <button onClick={createAdmin} disabled={creatingAdmin} className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
                    {creatingAdmin ? "Creating…" : "Create Admin"}
                  </button>
                  <button onClick={() => { setNewAdminEmail(""); setNewAdminPassword(""); }} className="px-3 py-2 rounded-lg border hover:bg-slate-50 text-sm">
                    Reset
                  </button>
                </div>
                <div className="text-xs text-slate-500">Admins created here will be able to sign in and manage the platform.</div>
              </div>
            </div>
          )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-left border-b">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u, idx) => (
                    <tr key={idx} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2">{u.name}</td>
                      <td className="px-4 py-2">
                        <Pill tone={u.role === "Admin" ? "rose" : u.role === "Doctor" ? "blue" : "slate"}>
                          {u.role}
                        </Pill>
                      </td>
                      <td className="px-4 py-2">{u.email}</td>
                      <td className="px-4 py-2">
                        <Pill tone={u.status === "Active" ? "emerald" : "amber"}>{u.status}</Pill>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <Link to={`/admin/users/${idx}`} className="px-2 py-1 text-xs rounded-md border hover:bg-slate-100">
                            View
                          </Link>
                          <button className="px-2 py-1 text-xs rounded-md border hover:bg-slate-100">
                            Edit
                          </button>
                          {u.status === "Active" ? (
                            <button className="px-2 py-1 text-xs rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200">
                              Suspend
                            </button>
                          ) : (
                            <button className="px-2 py-1 text-xs rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200">
                              Activate
                            </button>
                          )}
                          <button className="px-2 py-1 text-xs rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200">
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-4 py-6 text-center text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manage Logs */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-slate-800">System Logs</h3>
              <div className="flex gap-2">
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option>All</option>
                  <option>INFO</option>
                  <option>WARN</option>
                  <option>ERROR</option>
                </select>
                <button className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">
                  Refresh
                </button>
                <button className="px-3 py-2 rounded-lg border text-sm hover:bg-slate-50">
                  Export
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-left border-b">
                    <th className="px-4 py-2 w-40">Timestamp</th>
                    <th className="px-4 py-2 w-24">Severity</th>
                    <th className="px-4 py-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l, i) => (
                    <tr key={i} className="border-b hover:bg-slate-50">
                      <td className="px-4 py-2">{l.ts}</td>
                      <td className="px-4 py-2">
                        <Pill tone={l.sev === "ERROR" ? "rose" : l.sev === "WARN" ? "amber" : "slate"}>
                          {l.sev}
                        </Pill>
                      </td>
                      <td className="px-4 py-2 text-slate-700">{l.msg}</td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-4 py-6 text-center text-slate-500">
                        No logs for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination placeholder */}
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>Showing {Math.min(10, filteredLogs.length)} of {filteredLogs.length}</span>
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded-md border hover:bg-slate-50">Prev</button>
                <button className="px-3 py-1 rounded-md border hover:bg-slate-50">Next</button>
              </div>
            </div>
          </div>
        </section>

        {/* Model Operations (1 col) */}
        <aside className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-800">Model Status</h3>
            <div className="mt-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Active Model</span>
                <Pill tone="emerald">v3.2.1</Pill>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Last Updated</span>
                <span className="text-slate-500">Oct 15, 2025</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Latency (P95)</span>
                <span className="text-slate-500">420 ms</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Accuracy (val)</span>
                <span className="text-slate-500">94.1%</span>
              </div>
            </div>

            <div className="mt-5 border-t pt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Candidate Version
              </label>
              <select
                value={candidateVersion}
                onChange={(e) => setCandidateVersion(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="v3.3.0">v3.3.0</option>
                <option value="v3.2.2-hotfix">v3.2.2-hotfix</option>
                <option value="v3.2.1">v3.2.1 (current)</option>
              </select>

              <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">
                Changelog / Notes
              </label>
              <textarea
                rows={4}
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="- Improved glioma segmentation\n- Reduced FP on AMCI\n- Added DICOM anonymizer"
              />

              <div className="mt-4 grid grid-cols-3 gap-2">
                <button className="px-3 py-2 rounded-lg border hover:bg-slate-50 text-sm">
                  Validate
                </button>
                <button className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
                  Deploy
                </button>
                <button className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm">
                  Rollback
                </button>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Deploy runs a rolling update. You can rollback instantly if error rate or latency
                exceeds thresholds.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-800">System Controls</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
                Backup System
              </button>
              <Link
                to="/admin/logs"
                className="px-3 py-2 rounded-lg border hover:bg-slate-50 text-sm text-center"
              >
                View Logs
              </Link>
              <button className="px-3 py-2 rounded-lg border hover:bg-slate-50 text-sm">
                Rotate Keys
              </button>
              <button className="px-3 py-2 rounded-lg border hover:bg-slate-50 text-sm">
                Reindex Search
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}