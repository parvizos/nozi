import { describe, expect, it } from "vitest";

import { DELETE as clearCart } from "../app/api/v1/cart/route";
import {
  DELETE as removeFavorite,
  POST as addFavorite,
} from "../app/api/v1/favorites/[productId]/route";

const params = Promise.resolve({
  productId: "00000000-0000-4000-8000-000000000001",
});

describe("mutation route origin protection", () => {
  const untrusted = () =>
    new Request("http://localhost:3000/api/test", {
      headers: { origin: "https://evil.example" },
      method: "POST",
    });

  it("rejects cart DELETE before authentication", async () => {
    const response = await clearCart(untrusted());
    expect(response.status).toBe(403);
  });

  it("rejects favorites POST and DELETE before authentication", async () => {
    expect((await addFavorite(untrusted(), { params })).status).toBe(403);
    expect((await removeFavorite(untrusted(), { params })).status).toBe(403);
  });
});
