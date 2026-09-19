import { getAiPolicy, getAiStatus, getAiTools } from "@/data/api";
import { AiHubScreen } from "@/features/tools/ai-hub-screen";

/** 14 AI 도구 허브. */
export default async function ToolsPage() {
  const [tools, policy, ai] = await Promise.all([getAiTools(), getAiPolicy(), getAiStatus()]);
  return <AiHubScreen tools={tools} policy={policy} aiReady={ai.connected} />;
}
