import { OrderStatus } from "@nozi/database";
import { handleSellerOrderAction } from "../../../../../../../lib/seller-order-action";
export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return handleSellerOrderAction(request, params, OrderStatus.PREPARING);
}
