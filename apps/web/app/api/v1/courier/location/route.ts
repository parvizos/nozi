import {
  courierLocationSchema,
  recordCourierLocation,
} from "@nozi/marketplace";

import { courierApi } from "../../../../../lib/courier-api";

export function POST(request: Request) {
  return courierApi(
    request,
    async ({ actor }) => ({
      location: await recordCourierLocation(
        actor,
        courierLocationSchema.parse(await request.json()),
      ),
    }),
    { mutation: true, status: 201 },
  );
}
