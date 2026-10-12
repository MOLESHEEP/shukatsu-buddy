import { llmAdminView } from "@/lib/admin";
import { AiSettings } from "./ai-settings";

export default async function AdminAi() {
  return <AiSettings initial={await llmAdminView()} />;
}
