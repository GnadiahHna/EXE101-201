import { createContext, useState, useContext, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserType } from '../types/auth';
import { setAccessToken, getAccessToken, http } from '../api/http';

export type User = {
  id?: number | string;
  fullName?: string;
  email?: string;
  phoneNumber?: string;
  userType?: string;
  role?: string;
  gender?: string;
};

type AuthContextType = {
  user: User | null;
  userType: UserType;
  isAuthenticated: boolean;
  login: (userData: User, token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  userType: 'Guest',
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

function loadStoredUserMeta(): User | null {
  try {
    const stored = sessionStorage.getItem('user_meta');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(loadStoredUserMeta);
  const navigate = useNavigate();

  // On initial mount, attempt silent refresh if session metadata exists but in-memory token is empty
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      if (!getAccessToken()) {
        try {
          const res = await http.post('/auth/refresh');
          const data = res.data?.data;
          if (data?.token && isMounted) {
            setAccessToken(data.token);
            if (data.user) {
              const fullUser: User = {
                id: data.user.id,
                fullName: data.user.fullName,
                userType: data.user.role,
                role: data.user.role,
              };
              setUser(fullUser);
              sessionStorage.setItem('user_meta', JSON.stringify(fullUser));
            }
          }
        } catch {
          if (isMounted) {
            setAccessToken(null);
            sessionStorage.removeItem('user_meta');
            setUser(null);
          }
        }
      }
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback((userData: User, token: string) => {
    const formattedUser = {
      ...userData,
      role: userData.role || userData.userType,
      userType: userData.userType || userData.role,
    };
    setAccessToken(token);
    sessionStorage.setItem('user_meta', JSON.stringify(formattedUser));
    setUser(formattedUser);
  }, []);

  const logout = async () => {
    try {
      await http.post('/auth/logout');
    } catch (err) {
      console.error('Logout network error:', err);
    } finally {
      setAccessToken(null);
      sessionStorage.removeItem('user_meta');
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      setUser(null);
      navigate('/');
    }
  };

  function toUserType(value?: string): UserType {
    const v = value || 'Guest';
    if (v === 'Guest' || v === 'Patient' || v === 'Doctor' || v === 'Receptionist' || v === 'Admin') {
      return v as UserType;
    }
    return 'Guest';
  }

  const role = user?.userType || user?.role;
  const userType = toUserType(role);
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        userType,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
