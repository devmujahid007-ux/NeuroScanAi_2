import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import logo from "../assests/logo.png";

const Navbar = () => {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const handleLogout = () => logout();

  const navRef = useRef(null);
  useEffect(() => {
    function handler(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setDashboardOpen(false);
      }
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between h-16" aria-label="Primary" ref={navRef}>
          
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3 focus:outline-none">
              {logo ? (
                <img
                  src={logo}
                  alt="NeuroScan"
                  className="h-10 w-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="h-8 w-8 text-slate-800"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2v20M2 12h20" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}

              <div className="flex flex-col leading-tight">
                <span className="text-lg font-semibold text-slate-800">NeuroScan</span>
                <span className="text-xs text-slate-400 -mt-1">
                  Brain Tumor & Alzheimer's Detection
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex md:items-center md:gap-6">
            <Link to="/" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              Home
            </Link>

            <Link to="/about" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              About
            </Link>

            <Link to="/contact" className="text-sm font-medium text-slate-700 hover:text-slate-900">
              Contact Us
            </Link>

            {/* Dashboard */}
            <div className="relative">
              <button
                onClick={() => setDashboardOpen((s) => !s)}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 focus:outline-none"
                aria-haspopup="menu"
                aria-expanded={dashboardOpen}
              >
                Dashboard
                <svg
                  className={`w-4 h-4 transform transition-transform ${
                    dashboardOpen ? "rotate-180" : ""
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeWidth="2" d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {dashboardOpen && (
                <ul className="absolute right-0 mt-2 w-56 bg-white border rounded-lg shadow-lg py-2 z-20">
                  {/* If we have a known user role, show only their dashboard link */}
                  {user && user.role ? (
                    <li>
                      {user.role.toLowerCase() === "patient" && (
                        <Link to="/patient-dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50">
                          Patient Dashboard
                        </Link>
                      )}
                      {user.role.toLowerCase() === "doctor" && (
                        <Link to="/doctor-dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50">
                          Doctor Dashboard
                        </Link>
                      )}
                      {(user.role.toLowerCase() === "admin" || user.role.toLowerCase() === "superadmin") && (
                        <Link to="/admin-dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50">
                          Admin Dashboard
                        </Link>
                      )}
                    </li>
                  ) : (
                    // fallback: show all dashboards when we don't know the user's role
                    <>
                      <li>
                        <Link to="/patient-dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50">
                          Patient Dashboard
                        </Link>
                      </li>
                      <li>
                        <Link to="/doctor-dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50">
                          Doctor Dashboard
                        </Link>
                      </li>
                      <li>
                        <Link to="/admin-dashboard" className="block px-4 py-2 text-sm hover:bg-slate-50">
                          Admin Dashboard
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Desktop Auth */}
          <div className="hidden md:flex items-center gap-3">
            {!user ? (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium px-3 py-2 rounded-md hover:bg-slate-50"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="text-sm font-semibold px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  Sign Up
                </Link>
              </>
            ) : (
              <button
                onClick={handleLogout}
                className="text-sm px-3 py-1 rounded-full border hover:bg-gray-50"
              >
                Logout
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileOpen((s) => !s)}
              className="p-2 rounded-md inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 focus:outline-none"
              aria-label="Toggle menu"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor">
                  <path strokeWidth="2" d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor">
                  <path strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Menu Panel */}
      {mobileOpen && (
        <div className="md:hidden border-t bg-white">
          <div className="px-4 pt-4 pb-6 space-y-3">
            <Link to="/" onClick={() => setMobileOpen(false)} className="block text-slate-700 font-medium">
              Home
            </Link>
            <Link to="/about" onClick={() => setMobileOpen(false)} className="block text-slate-700 font-medium">
              About
            </Link>
            <Link to="/contact" onClick={() => setMobileOpen(false)} className="block text-slate-700 font-medium">
              Contact Us
            </Link>

            {/* Mobile Auth */}
            <div className="pt-3 border-t mt-2 flex gap-2">
              {!user ? (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 text-center py-2 rounded-md border"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 text-center py-2 rounded-md bg-blue-600 text-white"
                  >
                    Sign Up
                  </Link>
                </>
              ) : (
                <button
                  onClick={handleLogout}
                  className="w-full text-center py-2 rounded-md border hover:bg-gray-100"
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
