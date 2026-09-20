import { getNotifications } from "@/data/api";
import { NotificationsScreen } from "@/features/home/notifications-screen";

/**
 * 알림함.
 *
 * 방금 온 알림이 보여야 하므로 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const items = await getNotifications();
  return <NotificationsScreen items={items} />;
}
