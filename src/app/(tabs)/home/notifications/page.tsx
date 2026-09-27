import { getNotifications, getPushState } from "@/data/api";
import { NotificationsScreen } from "@/features/home/notifications-screen";

/**
 * 알림함.
 *
 * 방금 온 알림이 보여야 하므로 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [items, push] = await Promise.all([getNotifications(), getPushState()]);
  return <NotificationsScreen items={items} push={push} />;
}
