import type { Metadata } from "next";

import { LobbyView } from "@/components/contest/lobby/LobbyView";

export const metadata: Metadata = {
  title: "Problems — Coding Night",
};

export default function ContestPage() {
  return <LobbyView />;
}
