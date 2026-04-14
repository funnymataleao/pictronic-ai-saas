"use client";

import * as React from "react";

interface AuthState {
  isLoginOpen: boolean;
  isRegisterOpen: boolean;
}

interface AuthContextValue extends AuthState {
  openLogin: () => void;
  closeLogin: () => void;
  openRegister: () => void;
  closeRegister: () => void;
  closeAll: () => void;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    isLoginOpen: false,
    isRegisterOpen: false,
  });

  const openLogin = () => setState({ isLoginOpen: true, isRegisterOpen: false });
  const closeLogin = () => setState((prev) => ({ ...prev, isLoginOpen: false }));
  const openRegister = () => setState({ isLoginOpen: false, isRegisterOpen: true });
  const closeRegister = () => setState((prev) => ({ ...prev, isRegisterOpen: false }));
  const closeAll = () => setState({ isLoginOpen: false, isRegisterOpen: false });

  return (
    <AuthContext.Provider
      value={{
        ...state,
        openLogin,
        closeLogin,
        openRegister,
        closeRegister,
        closeAll,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
