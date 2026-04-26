"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);

  const handlePasswordLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/v1/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const stores = data.data?.user?.stores;
        if (stores && stores.length > 1) {
          router.push("/select-store");
        } else {
          router.push(redirect);
          router.refresh();
        }
      } else {
        setError(data.error?.message || "登录失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleSmsLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/v1/auth/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.get("phone"),
          code: formData.get("code"),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const stores = data.data?.user?.stores;
        if (stores && stores.length > 1) {
          router.push("/select-store");
        } else {
          router.push(redirect);
          router.refresh();
        }
      } else {
        setError(data.error?.message || "登录失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = async () => {
    const phoneInput = document.querySelector<HTMLInputElement>(
      'input[name="phone"]'
    );
    if (!phoneInput?.value) {
      setError("请输入手机号");
      return;
    }
    try {
      await fetch("/api/v1/auth/staff/sms-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneInput.value }),
      });
      setSmsCountdown(60);
      const timer = setInterval(() => {
        setSmsCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError("发送验证码失败");
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel — dark hero */}
      <div className="relative flex flex-1 items-center justify-center bg-apple-sidebar px-8 py-16 lg:py-0 overflow-hidden">
        {/* Subtle decorative gradient orb */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/[0.03] blur-3xl" />

        <div className="relative z-10 text-center max-w-sm">
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            精卫识仪
          </h1>
          <p className="mt-2 text-lg text-white/60">社区基层健康管理平台</p>

          {/* Subtle divider */}
          <div className="mx-auto mt-8 h-px w-16 bg-white/10" />

          <p className="mt-6 text-sm leading-relaxed text-white/40">
            以科技赋能基层健康服务，让管理更高效、让关怀更精准
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center bg-background px-4 py-12 sm:px-8 lg:py-0">
        <div className="w-full max-w-md">
          {/* Mobile-only brand (hidden on desktop where left panel shows it) */}
          <div className="mb-8 text-center lg:hidden">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              精卫识仪
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              社区基层健康管理平台
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-sm p-8">
            <div className="mb-6">
              <h2 className="font-display text-2xl font-semibold text-foreground">
                欢迎回来
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                登录以继续使用管理系统
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-apple-error/10 px-4 py-2.5 text-sm text-apple-error">
                {error}
              </div>
            )}

            <Tabs defaultValue="password">
              <TabsList className="w-full bg-transparent p-0 h-auto border-b border-border">
                <TabsTrigger
                  value="password"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
                >
                  密码登录
                </TabsTrigger>
                <TabsTrigger
                  value="sms"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-0 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground"
                >
                  短信登录
                </TabsTrigger>
              </TabsList>

              <TabsContent value="password" className="mt-6">
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">用户名</Label>
                    <Input
                      id="username"
                      name="username"
                      placeholder="请输入用户名"
                      required
                      className="rounded-lg border-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">密码</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="请输入密码"
                      required
                      className="rounded-lg border-input"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full rounded-lg h-11 bg-primary text-primary-foreground"
                    disabled={loading}
                  >
                    {loading ? "登录中..." : "登录"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="sms" className="mt-6">
                <form onSubmit={handleSmsLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">手机号</Label>
                    <Input
                      id="phone"
                      name="phone"
                      placeholder="请输入手机号"
                      required
                      className="rounded-lg border-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">验证码</Label>
                    <div className="flex gap-2">
                      <Input
                        id="code"
                        name="code"
                        placeholder="请输入验证码"
                        required
                        className="rounded-lg border-input"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendSms}
                        disabled={smsCountdown > 0}
                        className="shrink-0 rounded-lg"
                      >
                        {smsCountdown > 0 ? `${smsCountdown}s` : "发送验证码"}
                      </Button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full rounded-lg h-11 bg-primary text-primary-foreground"
                    disabled={loading}
                  >
                    {loading ? "登录中..." : "登录"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
