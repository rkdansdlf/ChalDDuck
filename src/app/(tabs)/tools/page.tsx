import { getAiPolicy, getAiTools } from "@/data/api";
import { AiHubScreen } from "@/features/tools/ai-hub-screen";

/** 14 AI 도구 허브. */
export default async function ToolsPage() {
  const [tools, policy] = await Promise.all([getAiTools(), getAiPolicy()]);
  return <AiHubScreen tools={tools} policy={policy} />;
}
