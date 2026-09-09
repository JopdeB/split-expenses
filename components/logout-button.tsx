import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline" size="sm">
        Uitloggen
      </Button>
    </form>
  );
}
