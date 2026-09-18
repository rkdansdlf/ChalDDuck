import { getRoles } from "@/data/api";
import { RoleScreen } from "@/features/onboarding/role-screen";

/** 06 희망 역할 · Veto — 1순위 희망 1개 + 피하고 싶은 역할 1개. */
export default async function RolePage() {
  const roles = await getRoles();
  return <RoleScreen roles={roles} />;
}
