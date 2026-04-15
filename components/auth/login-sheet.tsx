"use client";

import * as React from "react";
import { useAuth } from "./auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function LoginSheet() {
  const { isLoginOpen, closeLogin, openRegister } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isPasswordLoading, setIsPasswordLoading] = React.useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "auth_failed") {
      setError("Google OAuth не завершился. Попробуйте снова.");
    }
  }, []);

  const getNextPath = React.useCallback(() => {
    if (typeof window === "undefined") {
      return "/";
    }
    const next = new URLSearchParams(window.location.search).get("next");
    return next && next.startsWith("/") ? next : "/";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPasswordLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Login failed");
      }

      closeLogin();
      window.location.assign(getNextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const next = encodeURIComponent(getNextPath());
      const res = await fetch(`/api/auth/google?next=${next}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Google login failed");
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("Google login URL is missing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed");
      setIsGoogleLoading(false);
    }
  };

  return (
    <Sheet open={isLoginOpen} onOpenChange={(open) => !open && closeLogin()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-neutral-900 border-white/10">
        <SheetHeader>
          <SheetTitle className="text-white">Вход в аккаунт</SheetTitle>
          <SheetDescription className="text-white/60">
            Войдите в свой аккаунт для доступа к персональным функциям
          </SheetDescription>
        </SheetHeader>
        <Card className="mt-6 bg-transparent border-none shadow-none">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-white"></CardTitle>
            <CardDescription className="text-white/60"></CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-white/5 border-white/20" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Пароль</Label>
                <Input id="password" type="password" placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-white/5 border-white/20" />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" disabled={isPasswordLoading || isGoogleLoading}>
                {isPasswordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Войти
              </Button>
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-neutral-900 px-2 text-white/40">или</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/20 hover:bg-white/5"
                onClick={handleGoogleLogin}
                disabled={isPasswordLoading || isGoogleLoading}
              >
                {isGoogleLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Войти с Google
              </Button>
              <p className="text-center text-sm text-white/60">
                Нет аккаунта?{" "}
                <button type="button" className="text-white hover:underline focus:outline-none" onClick={() => { closeLogin(); openRegister(); }}>
                  Зарегистрироваться
                </button>
              </p>
            </CardFooter>
          </form>
        </Card>
      </SheetContent>
    </Sheet>
  );
}
