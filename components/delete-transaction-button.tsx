"use client";

import { useTransition } from "react";
import { deleteTransaction } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function DeleteTransactionButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Deze transactie verwijderen?")) return;
        start(() => deleteTransaction(id));
      }}
      className="text-red-600 hover:text-red-700 h-7 px-2"
    >
      {pending ? "…" : "Verwijder"}
    </Button>
  );
}
