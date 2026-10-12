import { query } from "@/lib/db";
import { Importer, type BatchRow } from "./importer";

export default async function AdminImport() {
  const rows = await query(
    `SELECT b.id, b.label, b.method, b.count, b.created_at,
            (SELECT count(*) FROM posts p WHERE p.import_batch = b.id AND p.status = 'draft')::int AS drafts,
            (SELECT count(*) FROM posts p WHERE p.import_batch = b.id AND p.status = 'published')::int AS published,
            (SELECT count(*) FROM posts p WHERE p.import_batch = b.id)::int AS remaining
       FROM import_batches b ORDER BY b.created_at DESC LIMIT 30`,
  );
  const batches = rows.map((r) => ({ ...(r as BatchRow), created_at: (r.created_at as Date).toISOString() }));
  return <Importer batches={batches} />;
}
