import {
  BadgeCheck,
  BellPlus,
  Bell,
  CalendarPlus,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  Mail,
  PackageSearch,
  Settings,
  SquarePlus,
  TicketPercent,
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
    ],
  },
  {
    title: 'Products',
    items: [
      {
        label: 'Create Product',
        href: '/dashboard/create-product',
        icon: SquarePlus,
      },
      {
        label: 'All Products',
        href: '/dashboard/all-products',
        icon: PackageSearch,
      },
    ],
  },
  {
    title: 'Services',
    items: [
      {
        label: 'Service Profile',
        href: '/dashboard/service-profile',
        icon: BadgeCheck,
      },
      {
        label: 'Service Requests',
        href: '/dashboard/service-requests',
        icon: Inbox,
      },
    ],
  },
  {
    title: 'Events',
    items: [
      {
        label: 'Create Event',
        href: '/dashboard/create-event',
        icon: CalendarPlus,
      },
      { label: 'All Events', href: '/dashboard/all-events', icon: BellPlus },
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
      { label: 'Settings', href: '/dashboard/settings', icon: Settings },
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: Bell,
        notificationsBadge: true,
      },
    ],
  },
  {
    title: 'Extras',
    items: [
      {
        label: 'Discount Codes',
        href: '/dashboard/discount-codes',
        icon: TicketPercent,
      },
    ],
  },
];
