import {
  Bell,
  Bike,
  Heart,
  LayoutDashboard,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which shop-store count to show next to the link. */
  badge?: 'wishlist' | 'cart';
};

export const DASHBOARD_HOME: NavItem = {
  label: 'Overview',
  href: '/dashboard',
  icon: LayoutDashboard,
};

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Shopping',
    items: [
      { label: 'My Orders', href: '/dashboard/orders', icon: Package },
      {
        label: 'Wishlist',
        href: '/dashboard/wishlist',
        icon: Heart,
        badge: 'wishlist',
      },
      {
        label: 'Cart',
        href: '/dashboard/cart',
        icon: ShoppingCart,
        badge: 'cart',
      },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Profile', href: '/dashboard/profile', icon: UserRound },
      { label: 'Addresses', href: '/dashboard/addresses', icon: MapPin },
      { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
      { label: 'Security', href: '/dashboard/security', icon: ShieldCheck },
    ],
  },
  {
    title: 'Extras',
    items: [
      { label: 'Back to shop', href: '/products', icon: ShoppingBag },
      { label: 'Become a seller', href: '/become-seller', icon: Store },
      { label: 'Deliver with us', href: '/rider', icon: Bike },
    ],
  },
];
