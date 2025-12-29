
import React, { createContext, useContext, useEffect, useState } from 'react';

type UserRole = 'COACH' | 'CLIENT';

interface User {
  id: string; // Changed to string
  name: string;
  role: UserRole;
  coach_id?: string | null; // Changed to string
}

interface AuthContextType {
  user: User | null;
  login: (userId: string) => Promise<User | null>; // Changed to string
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => null,
  logout: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check sessionStorage on mount
    const storedUser = sessionStorage.getItem('straps_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (id: string): Promise<User | null> => {
    setIsLoading(true);
    try {
        const res = await fetch(`/api/users/${id}`);
        if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            sessionStorage.setItem('straps_user', JSON.stringify(userData)); // Store full object in Session
            return userData;
        }
        return null;
    } catch (error) {
        console.error("Login failed", error);
        return null;
    } finally {
        setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('straps_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
