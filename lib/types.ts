export type Location = {
  id: number;
  name: string;
  sort_order: number;
};

export type LedgerAccount = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
};

export type BtwCode = {
  id: number;
  label: string;
  rate: number | null;
  kind: "inkoop" | "verkoop" | "beide" | null;
  sort_order: number;
};

export type Transaction = {
  id: number;
  location_id: number;
  boekstuk: number | null;
  datum: string;
  bedrag_inkomsten: number;
  btw_inkomsten: number;
  bedrag_uitgaven: number;
  btw_uitgaven: number;
  bedrag_deeluitgaven: number;
  btw_deeluitgaven: number;
  btw_code_id: number | null;
  ledger_account_id: number | null;
  omschrijving: string | null;
};

export type TransactionWithRefs = Transaction & {
  jaar: number;
  kwartaal: string;
  location_name: string | null;
  ledger_code: string | null;
  ledger_name: string | null;
  btw_label: string | null;
  btw_rate: number | null;
};

export type GrootboekRow = {
  jaar: number;
  location_id: number;
  location_name: string;
  ledger_account_id: number;
  ledger_code: string;
  ledger_name: string;
  inkomsten: number;
  uitgaven: number;
  deeluitgaven: number;
  netto: number;
};

export type BtwQuarterRow = {
  location_id: number;
  location_name: string;
  jaar: number;
  kwartaal: string;
  btw_inkomsten: number;
  btw_uitgaven: number;
  btw_netto: number;
};
