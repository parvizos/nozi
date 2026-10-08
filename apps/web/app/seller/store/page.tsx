import { getSellerStore } from "@nozi/marketplace";
import { SellerStoreForm } from "../../../components/seller-store-form";
import { requireSellerPageActor } from "../../../lib/require-seller-page";

export default async function SellerStorePage() {
  const store = await getSellerStore(await requireSellerPageActor());
  const existing = new Map(store.openingHours.map((h) => [h.dayOfWeek, h]));
  const openingHours = Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = index + 1;
    const h = existing.get(dayOfWeek);
    return {
      closesAt: h?.closesAt ?? "20:00",
      dayOfWeek,
      isClosed: h?.isClosed ?? false,
      opensAt: h?.opensAt ?? "09:00",
    };
  });
  return (
    <>
      <p className="text-xs font-bold tracking-[.18em] text-[#9a355c] uppercase">
        Store
      </p>
      <h1 className="mt-2 text-4xl font-semibold">Настройки магазина</h1>
      <p className="mt-2 text-[#6f6863]">
        Публичная информация, график и доступность.
      </p>
      <SellerStoreForm
        initial={{
          defaultPreparationMinutes: store.defaultPreparationMinutes,
          deliveryFeeAmount: store.deliveryFeeAmount,
          description: store.description,
          id: store.id,
          isOpen: store.isOpen,
          isTemporarilyPaused: store.isTemporarilyPaused,
          minimumOrderAmount: store.minimumOrderAmount,
          name: store.name,
          openingHours,
          pauseReason: store.pauseReason,
          phoneE164: store.phoneE164,
        }}
      />
    </>
  );
}
