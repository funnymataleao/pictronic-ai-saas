"use client";

import * as React from "react";
import { useAuth } from "./auth-provider";
import { LoginSheet } from "./login-sheet";
import { RegisterSheet } from "./register-sheet";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AuthButtons({ isAuthenticated = false }) {
  const { openLogin, openRegister } = useAuth();
  const [isLoggedIn, setIsLoggedIn] = React.useState(isAuthenticated);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "GET" });
    setIsLoggedIn(false);
    window.location.reload();
  };

  if (isLoggedIn) {
    return (
      <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white/80 hover:text-white">
        <LogOut className="h-4 w-4 mr-2" /> Выход
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button 
        variant="ghost" 
        size="sm" 
        className="text-white/80 hover:text-white hover:bg-white/5"
        onClick={() => openLogin()}
      >
        Вход
      </Button>
      
      <Button 
        variant="default" 
        size="sm" 
        className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500"
        onClick={() => openRegister()}
      >
        Регистрация
      </Button>

      {/* Окна рендерятся отдельно и слушают контекст */}
      <LoginSheet />
      <RegisterSheet />
    </div>
  );
}
