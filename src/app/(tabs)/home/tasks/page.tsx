import { getCurrentTeam, getRoster, getTaskKinds, getTasks } from "@/data/api";
import { TasksScreen } from "@/features/tasks/tasks-screen";

/** 21 할 일 · 체크리스트. */
export default async function TasksPage() {
  const team = await getCurrentTeam();
  // 명단은 담당자를 고를 때 필요하다 — 지금 팀에 있는 사람에게만 배정한다.
  const [tasks, kinds, roster] = await Promise.all([
    getTasks(team.id),
    getTaskKinds(),
    getRoster(team.id),
  ]);
  return <TasksScreen tasks={tasks} kinds={kinds} roster={roster} />;
}
