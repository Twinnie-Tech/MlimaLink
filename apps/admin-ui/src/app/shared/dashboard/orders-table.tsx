import type { AdminOrder } from '@org/models';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import { orderStatusLabel } from '@org/models/delivery';
import {
  Badge,
  DataTable,
  STATUS_TONE,
  cellClassName,
  formatDate,
  formatMoney,
} from './ui';

/** Orders with how each one's money is split between MlimaLink, the shop and the rider. */
export function OrdersTable({
  label,
  orders,
}: {
  label: string;
  orders: AdminOrder[];
}) {
  return (
    <DataTable
      label={label}
      columns={[
        'Order',
        'Shop',
        'Goods',
        `MlimaLink (${PLATFORM_FEE_PERCENT}%)`,
        `Seller (${100 - PLATFORM_FEE_PERCENT}%)`,
        'Delivery',
        'Status',
      ]}
      minWidth={860}
    >
      {orders.map((order) => (
        <tr key={order.id}>
          <td className={cellClassName}>
            <span className="block font-medium text-neutral-900">
              {order.number}
            </span>
            <span className="block text-xs text-neutral-500">
              {order.buyerName} · {order.buyerEmail}
            </span>
            <span className="text-xs text-neutral-500">
              {formatDate(order.createdAt)} · {order.itemCount} item
              {order.itemCount === 1 ? '' : 's'}
            </span>
          </td>
          <td className={cellClassName}>{order.shopName}</td>
          <td className={cellClassName}>{formatMoney(order.goods)}</td>
          <td className={`${cellClassName} font-medium text-violet-700`}>
            {formatMoney(order.platformFee)}
          </td>
          <td className={`${cellClassName} text-emerald-700`}>
            {formatMoney(order.sellerEarnings)}
          </td>
          <td className={cellClassName}>{formatMoney(order.deliveryFee)}</td>
          <td className={cellClassName}>
            <Badge tone={STATUS_TONE[order.status]}>
              {orderStatusLabel(order.status)}
            </Badge>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
