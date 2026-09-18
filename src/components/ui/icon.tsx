import {
  AlarmClock,
  ArrowRight,
  BatteryFull,
  BookOpen,
  CalendarArrowUp,
  CalendarCheck,
  CalendarClock,
  CalendarSearch,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Clock,
  Copy,
  Dices,
  Disc3,
  FolderOpen,
  GitFork,
  Hand,
  House,
  Info,
  KeyRound,
  LayoutGrid,
  List,
  ListOrdered,
  Lock,
  MessagesSquare,
  Plus,
  Search,
  Settings2,
  Share2,
  Signal,
  SkipForward,
  Sparkles,
  ThumbsUp,
  Ticket,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
  UserSearch,
  UsersRound,
  WandSparkles,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * 아이콘 레지스트리.
 *
 * 프로토타입이 lucide 를 kebab-case 이름으로 부르므로 그 어휘를 그대로 유지한다.
 * 라이브러리 전체를 import 하면 번들에 1000개가 넘는 아이콘이 들어오므로
 * **실제로 쓰는 아이콘만** 여기에 등록한다. 새 화면에서 아이콘이 필요하면
 * 위 import 와 아래 맵에 한 줄씩 추가하면 된다.
 */
const REGISTRY = {
  "alarm-clock": AlarmClock,
  "arrow-right": ArrowRight,
  "battery-full": BatteryFull,
  "book-open": BookOpen,
  "calendar-arrow-up": CalendarArrowUp,
  "calendar-check": CalendarCheck,
  "calendar-clock": CalendarClock,
  "calendar-search": CalendarSearch,
  "calendar-x": CalendarX,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  circle: Circle,
  "circle-alert": CircleAlert,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  "circle-dot": CircleDot,
  clock: Clock,
  copy: Copy,
  dices: Dices,
  "disc-3": Disc3,
  "folder-open": FolderOpen,
  "git-fork": GitFork,
  hand: Hand,
  house: House,
  info: Info,
  "key-round": KeyRound,
  "layout-grid": LayoutGrid,
  list: List,
  "list-ordered": ListOrdered,
  lock: Lock,
  "messages-square": MessagesSquare,
  plus: Plus,
  search: Search,
  "settings-2": Settings2,
  "share-2": Share2,
  signal: Signal,
  "skip-forward": SkipForward,
  sparkles: Sparkles,
  "thumbs-up": ThumbsUp,
  ticket: Ticket,
  "trash-2": Trash2,
  "user-minus": UserMinus,
  "user-plus": UserPlus,
  "user-round": UserRound,
  "user-search": UserSearch,
  "users-round": UsersRound,
  "wand-sparkles": WandSparkles,
  wifi: Wifi,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function Icon({ name, size = 20, strokeWidth = 2, className }: IconProps) {
  const Glyph = REGISTRY[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      style={{ flex: "0 0 auto" }}
    />
  );
}
