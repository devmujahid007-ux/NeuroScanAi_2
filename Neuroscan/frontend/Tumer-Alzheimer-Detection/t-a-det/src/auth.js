// src/auth.js
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { login as apiLogin, me as apiMe } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      const token = localStorage.getItem("token");
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const profile = await apiMe();
        if (mounted) setUser(profile);
      } catch {
        localStorage.removeItem("token");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    hydrate();
    return () => { mounted = false; };
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin(email, password);
    localStorage.setItem("token", res.access_token);
    const profile = await apiMe();
    setUser(profile);
    return profile;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const value = useMemo(() => ({ user, login, logout, loading }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
