import { handleCourierDeliveryAction } from "../../../../../../../lib/courier-delivery-action";

export function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> },
) {
  return handleCourierDeliveryAction(request, params, "START");
}
