-- Teams belong to divisions now: each division fields its own teams, and the standings tabs
-- group by it. Null stays legal (a team open to anyone), which is every existing row.
-- Applied with `migrate deploy`; see 20260802180000 for why not `migrate dev`.

ALTER TABLE "Team" ADD COLUMN "divisionId" TEXT;
ALTER TABLE "Team" ADD CONSTRAINT "Team_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Team_divisionId_idx" ON "Team"("divisionId");
