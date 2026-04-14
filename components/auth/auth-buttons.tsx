"use client";

import * as React from "react";
import { LoginSheet } from "./login-sheet";
import { RegisterSheet } from "./register-sheet";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { SheetTrigger } from "@/components/ui/sheet";

export function AuthButtons({ isAuthenticated = false }) {
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
      {/* Оборачиваем кнопки прямо в триггеры — это не ломается никогда */}
      <LoginSheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/5">
            Вход
          </Button>
        </SheetTrigger>
      </LoginSheet>

      <RegisterSheet>
        <SheetTrigger asChild>
          <Button variant="default" size="sm" className="bg-gradient-to-r from-violet-600 to-indigo-600">
            Регистрация
          </Button>
        </SheetTrigger>
      </RegisterSheet>
    </div>
  );
}
