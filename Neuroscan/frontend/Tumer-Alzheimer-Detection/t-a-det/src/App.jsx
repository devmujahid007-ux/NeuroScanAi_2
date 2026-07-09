// src/App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PatientDashboardPage from "./pages/PatientDashboardPage";
import DoctorDashboardPage from "./pages/DoctorDashboardPage";
import AdminDashboard from "./pages/AdminDashboard";
import UploadMRI from "./pages/UploadMRI";
import ResultsPage from "./pages/ResultsPage";


/**
 * App root - central router and top-level layout
 * Uses Tailwind utility classes for spacing
 */
function App() {
  return (
    <AuthProvider>
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Main content */}
      <main className="flex-1 container-max pt-6 pb-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/patient-dashboard" element={<ProtectedRoute roles={['patient']}><PatientDashboardPage /></ProtectedRoute>} />
          <Route path="/doctor-dashboard" element={<ProtectedRoute roles={['doctor']}><DoctorDashboardPage /></ProtectedRoute>} />
          <Route path="/admin-dashboard" element={<ProtectedRoute roles={['admin','superadmin']}><AdminDashboard /></ProtectedRoute>} />
          <Route path="/upload-mri" element={<ProtectedRoute roles={['patient', 'doctor', 'admin', 'superadmin']}><UploadMRI /></ProtectedRoute>} />
          <Route path="/results/:reportId" element={<ProtectedRoute roles={['patient', 'doctor', 'admin', 'superadmin']}><ResultsPage /></ProtectedRoute>} />
        </Routes>
        
      </main>

      <Footer />
    </div>
    </AuthProvider>
  );
}

export default App;
