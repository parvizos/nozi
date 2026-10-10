import { AuthorizationError } from "@nozi/auth";
import { courierApi } from "../../../../../../../lib/courier-api";

export function POST(request: Request) {
  return courierApi(
    request,
    async () => {
      throw new AuthorizationError(
        "FORBIDDEN",
        "Решение о возврате принимает оператор",
      );
    },
    { mutation: true },
  );
}
