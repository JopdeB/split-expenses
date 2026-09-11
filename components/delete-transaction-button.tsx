"use client";

import { useTransition } from "react";
import { deleteTransaction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function DeleteTransactionButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm("Deze transactie verwijderen?")) return;
        start(() => deleteTransaction(id));
      }}
    >
      {pending ? "Bezig met verwijderen…" : "Verwijder"}
    </Button>
  );
}
