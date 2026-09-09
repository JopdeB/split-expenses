"use client";

import { useActionState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginResult } from "@/lib/actions/auth";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [state, formAction, pending] = useActionState<LoginResult | null, FormData>(
    login,
    null,
  );

  const error = state && "error" in state ? state.error : null;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Inloggen</CardTitle>
          <CardDescription>
            Vul je e-mailadres en wachtwoord in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="naam@voorbeeld.nl"
                  autoComplete="email"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Wachtwoord</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Bezig met inloggen…" : "Inloggen"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
