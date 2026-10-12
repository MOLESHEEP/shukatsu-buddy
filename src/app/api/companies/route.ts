import { z } from "zod";
import { readJson, withUser } from "@/lib/api";
import { createCompany, listCompanies } from "@/lib/data";
import { localToIso } from "@/lib/time";

export const GET = withUser(async (_req, user) => ({ companies: await listCompanies(user.id) }));

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  industry: z.string().max(60).optional(),
  channel: z.string().max(60).optional(),
  notes: z.string().max(4000).optional(),
  next_action: z.string().max(200).optional(),
  next_deadline: z.string().nullable().optional(),
});

export const POST = withUser(async (req, user) => {
  const body = await readJson(req, Body);
  const id = await createCompany(user.id, { ...body, next_deadline: localToIso(body.next_deadline) });
  return { id };
});
