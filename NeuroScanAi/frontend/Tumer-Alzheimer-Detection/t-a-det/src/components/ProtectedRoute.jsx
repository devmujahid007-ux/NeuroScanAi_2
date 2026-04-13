import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { me } from "../api";

export default function ProtectedRoute({ children, roles = [], allow = [] }) {
  // 'allow' is legacy; prefer `roles` prop. Merge for backward-compatibility.
  const rolesToCheck = Array.isArray(roles) && roles.length ? roles : allow;

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState(false);
  const [redirectTo, setRedirectTo] = useState(null);

  useEffect(() => {
    async function check() {
      try {
        const user = await me(); // verify token
        // If specific roles were required, block mismatched roles
        const role = (user.role || "patient").toLowerCase();
        const allowed = rolesToCheck.map((r) => String(r).toLowerCase());
        if (rolesToCheck.length > 0 && !allowed.includes(role)) {
          setAccess(false);
          // send the user to their own dashboard if they are authenticated
          const dest =
            (role === "admin" || role === "superadmin")
              ? "/admin-dashboard"
              : role === "doctor"
              ? "/doctor-dashboard"
              : "/patient-dashboard";
          setRedirectTo(dest);
        } else {
          setAccess(true);
        }
      } catch (err) {
        setAccess(false);
      } finally {
        setLoading(false);
      }
    }
    check();
  }, [rolesToCheck]);

  if (loading) return <div className="p-4 text-center">Checking access…</div>;

  if (!access) {
    // Unauthenticated users go to login; authenticated but wrong-role users are redirected to their dashboard
    return <Navigate to={redirectTo || "/login"} replace />;
  }

  return children;
}
