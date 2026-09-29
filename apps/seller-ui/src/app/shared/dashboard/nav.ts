import {
  BellPlus,
  Bell,
  CalendarPlus,
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

export type NavItem = { label: string; href: string; icon: LucideIcon };

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
      { label: 'Inbox', href: '/dashboard/inbox', icon: Mail },
      { label: 'Settings', href: '/dashboard/settings', icon: Settings },
      {
        label: 'Notifications',
        href: '/dashboard/notifications',
        icon: Bell,
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
