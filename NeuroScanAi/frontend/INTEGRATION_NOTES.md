# Frontend Integration Notes
- Ensure your router has routes for /login and /register pointing to these pages.
- Protect dashboards like:
  <ProtectedRoute roles={['doctor']}><DoctorDashboard /></ProtectedRoute>
- Set REACT_APP_API_URL to point to your backend when not localhost.
