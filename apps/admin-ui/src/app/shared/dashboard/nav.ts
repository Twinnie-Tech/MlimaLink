import {
  Bell,
  CalendarRange,
  FileClock,
  LayoutDashboard,
  ListOrdered,
  Mail,
  Package,
  Palette,
  Settings,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shows the unseen chat message count next to the link. */
  unseenBadge?: boolean;
  /** Shows the unread notification count next to the link. */
  notificationsBadge?: boolean;
};

export const DASHBOARD_HOME: NavItem = {
  label: 'Dashboard',
  href: '/dashboard',
  icon: LayoutDashboard,
};

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Main Menu',
    items: [
      { label: 'Orders', href: '/dashboard/orders', icon: ListOrdered },
      { label: 'Payments', href: '/dashboard/payments', icon: Wallet },
      { label: 'Products', href: '/dashboard/products', icon: Package },
      { label: 'Events', href: '/dashboard/events', icon: CalendarRange },
      { label: 'Users', href: '/dashboard/users', icon: Users },
      { label: 'Sellers', href: '/dashboard/sellers', icon: Store },
    ],
  },
  {
    title: 'Controllers',
    items: [
      {
        label: 'Inbox',
        href: '/dashboard/inbox',
        icon: Mail,
        unseenBadge: true,
      },
      { label: 'Loggers', href: '/dashboard/loggers', icon: FileClock },
      { label: 'Management', href: '/dashboard/management', icon: Settings },
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: Bell,
        notificationsBadge: true,
      },
    ],
  },
  {
    title: 'Customization',
    items: [
      {
        label: 'All Customization',
        href: '/dashboard/customization',
        icon: Palette,
      },
    ],
  },
];
