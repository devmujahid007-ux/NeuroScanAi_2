import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../api"; // 👈 REAL BACKEND API

const roleFields = {
  Patient: [
    { name: "fullName", label: "Full Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" },
  ],
  Doctor: [
    { name: "fullName", label: "Full Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "password", label: "Password", type: "password" },
  ],
  // Admin signups are not allowed from the public registration form.
  // Admins must be created by a Super Admin (managed centrally).
};

export default function Register() {
  const navigate = useNavigate();
  const [role, setRole] = useState("Patient");
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const onChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const validate = () => {
    const req = roleFields[role].map((f) => f.name);
    const errs = {};
    for (const k of req) {
      if (!String(form[k] || "").trim()) errs[k] = "Required";
    }
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) errs.email = "Invalid email";
    if (form.password && String(form.password).length < 6) errs.password = "Min 6 chars";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // 👉 UPDATED: REAL BACKEND API CALL
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      // Convert UI role to backend roles
      const backendRole =
        role.toLowerCase() === "doctor"
          ? "doctor"
          : role.toLowerCase() === "admin"
          ? "admin"
          : "patient";

      // Send to backend FastAPI
      await registerUser({
        email: form.email,
        password: form.password,
        role: backendRole,
        name: form.fullName,
      });

      setLoading(false);

      navigate("/login", {
        state: { justSignedUp: true, email: form.email, role: backendRole },
      });
    } catch (err) {
      console.error("Registration Error:", err);
      alert(err.message || "Registration failed");
      setLoading(false);
    }
  };

  const fields = roleFields[role];

  const baseClasses = "w-full border rounded-lg px-4 py-2 outline-none focus:ring ";
  const fieldClass = (name) => baseClasses + (errors[name] ? "border-red-500" : "border-gray-300");

  const renderField = (f) => {
    if (f.name === "email") {
      return (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
          <input
            name="email"
            type="text"
            inputMode="email"
            value={form.email || ""}
            onChange={onChange}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@example.com"
            className={fieldClass("email")}
          />
          {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
        </>
      );
    }

    if (f.name === "password") {
      return (
        <>
          <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
          <div className="relative">
            <input
              name="password"
              type={showPass ? "text" : "password"}
              value={form.password || ""}
              onChange={onChange}
              autoComplete="off"
              spellCheck={false}
              placeholder="Create a password"
              className={fieldClass("password")}
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
            >
              {showPass ? "Hide" : "Show"}
            </button>
          </div>
          {errors.password && <p className="text-red-600 text-sm mt-1">{errors.password}</p>}
        </>
      );
    }

    return (
      <>
        <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
        <input
          name={f.name}
          type={f.type}
          value={form[f.name] || ""}
          onChange={onChange}
          className={fieldClass(f.name)}
        />
        {errors[f.name] && <p className="text-red-600 text-sm mt-1">{errors[f.name]}</p>}
      </>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 py-10 px-4">
      <div className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-xl">
        <h2 className="text-3xl font-bold text-center text-blue-700 mb-2">Create an account</h2>
        <p className="text-center text-gray-600 mb-6">Choose a role and fill in the required details.</p>

        <div className="flex gap-2 justify-center mb-6">
          {Object.keys(roleFields).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r);
                setErrors({});
              }}
              className={
                "px-4 py-2 rounded-full border " +
                (role === r ? "bg-blue-600 text-white" : "hover:bg-gray-50")
              }
              type="button"
            >
              {r}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
          {fields.map((f) => (
            <div key={f.name}>{renderField(f)}</div>
          ))}

          <button
            disabled={loading}
            type="submit"
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70"
          >
            {loading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
