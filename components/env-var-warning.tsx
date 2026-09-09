import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function EnvVarWarning() {
  return (
    <div className="flex gap-4 items-center">
      <Badge variant={"outline"} className="font-normal">
        DATABASE_URL ontbreekt
      </Badge>
      <Button size="sm" variant={"outline"} disabled>
        Inloggen
      </Button>
    </div>
  );
}
