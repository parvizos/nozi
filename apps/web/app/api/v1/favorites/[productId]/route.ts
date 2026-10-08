import { addFavorite, removeFavorite } from "@nozi/marketplace";
import { z } from "zod";

import { authenticatedApi } from "../../../../../lib/authenticated-api";

const idSchema = z.uuid();

export function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  return authenticatedApi(
    request,
    async ({ actor }) => {
      const productId = idSchema.parse((await params).productId);
      await addFavorite(actor, productId);
      return { favorite: true };
    },
    { mutation: true },
  );
}

export function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  return authenticatedApi(
    request,
    async ({ actor }) => {
      const productId = idSchema.parse((await params).productId);
      await removeFavorite(actor, productId);
      return { favorite: false };
    },
    { mutation: true },
  );
}
