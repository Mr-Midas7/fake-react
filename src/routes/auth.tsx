import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/logo-shp.png.asset.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Login | Fake Rider Motorparts" },
      {
        name: "description",
        content: "Staff-only login for the Fake Rider Motorparts appointment management console.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin Login | Fake Rider Motorparts" },
      { property: "og:description", content: "Staff-only access to the shop management console." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  const signIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    onSuccess: () => navigate({ to: "/admin", replace: true }),
    onError: (e: Error) => toast.error(e.message || "Invalid email or password."),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md border-border/70 bg-card/70">
        <CardContent className="p-8">
          <img src={logo.url} alt="Fake Rider Motorparts logo" className="mx-auto h-24 w-auto" />
          <h1 className="mt-4 text-center font-display text-2xl uppercase">Admin login</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Shop staff access only.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              signIn.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@fakerider.ph"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full font-display uppercase"
              disabled={signIn.isPending}
            >
              {signIn.isPending ? <Lock className="animate-pulse" /> : <Lock />} Sign in
            </Button>
          </form>

          <Button asChild variant="ghost" className="mt-4 w-full justify-center text-sm">
            <Link to="/">
              <ArrowLeft /> Back to home
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
