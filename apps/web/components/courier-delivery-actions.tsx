"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Action =
  | "accept"
  | "arrived"
  | "pickup"
  | "start"
  | "deliver"
  | "returned";
const nextAction: Record<string, Action | undefined> = {
  ACCEPTED: "arrived",
  ARRIVED_AT_STORE: "pickup",
  ASSIGNED: "accept",
  ON_THE_WAY: "deliver",
  PICKED_UP: "start",
  RETURNING_TO_STORE: "returned",
};
const labels: Record<Action, string> = {
  accept: "Принять доставку",
  arrived: "Я в магазине",
  deliver: "Заказ доставлен",
  pickup: "Забрал заказ",
  start: "Начать доставку",
  returned: "Заказ возвращён в магазин",
};

export function CourierDeliveryActions({
  orderNumber,
  status,
  deliveryCodeRequired,
}: {
  orderNumber: string;
  status: string;
  deliveryCodeRequired: boolean;
}) {
  const router = useRouter();
  const action = nextAction[status];
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [showFailure, setShowFailure] = useState(false);
  const [showDeliveryCode, setShowDeliveryCode] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState("");
  const [reason, setReason] = useState("RECIPIENT_UNAVAILABLE");
  const [note, setNote] = useState("");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function post(path: string, body?: object) {
    setBusy(path);
    setError("");
    try {
      const response = await fetch(path, {
        ...(body
          ? {
              body: JSON.stringify(body),
              headers: { "content-type": "application/json" },
            }
          : {}),
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok)
        throw new Error(result.message ?? "Операция не выполнена");
      router.refresh();
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Нет соединения. Проверьте сеть и повторите.",
      );
      return false;
    } finally {
      setBusy("");
    }
  }

  async function perform() {
    if (!action) return;
    if (action === "deliver" && deliveryCodeRequired) {
      setShowDeliveryCode(true);
      return;
    }
    const confirmation =
      action === "deliver"
        ? "Подтвердить, что заказ лично передан получателю?"
        : `${labels[action]}?`;
    if (!window.confirm(confirmation)) return;
    await post(
      `/api/v1/courier/deliveries/${encodeURIComponent(orderNumber)}/${action}`,
      undefined,
    );
  }

  async function confirmDeliveryWithCode() {
    if (!/^\d{6}$/.test(deliveryCode)) {
      setError("Введите 6 цифр из сообщения получателя");
      return;
    }
    const delivered = await post(
      `/api/v1/courier/deliveries/${encodeURIComponent(orderNumber)}/deliver`,
      { deliveryCode },
    );
    if (delivered) {
      setShowDeliveryCode(false);
      setDeliveryCode("");
    }
  }

  async function reportFailure() {
    if (!window.confirm("Отправить проблему в operations?")) return;
    await post(
      `/api/v1/courier/deliveries/${encodeURIComponent(orderNumber)}/failed`,
      { note: note || undefined, reason },
    );
    setShowFailure(false);
  }

  function shareLocation() {
    if (!navigator.onLine) {
      setError("Нет сети. Геопозиция не отправлена.");
      return;
    }
    if (!navigator.geolocation) {
      setError("Геопозиция не поддерживается устройством");
      return;
    }
    setBusy("location");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void post("/api/v1/courier/location", {
          accuracy: position.coords.accuracy,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          orderNumber,
        });
      },
      (positionError) => {
        setBusy("");
        const messages: Record<number, string> = {
          1: "Доступ к геопозиции отклонён. Его можно разрешить в настройках браузера.",
          2: "Позиция сейчас недоступна. Попробуйте ещё раз на открытом месте.",
          3: "Не удалось определить позицию вовремя. Повторите попытку.",
        };
        setError(messages[positionError.code] ?? "Геопозиция не отправлена.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  return (
    <section className="space-y-3">
      {!online ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          Нет сети. Не закрывайте страницу и повторите действие после
          подключения.
        </p>
      ) : null}
      {action ? (
        <button
          className="min-h-16 w-full rounded-2xl bg-[#17624a] px-6 py-4 text-lg font-black text-white shadow-lg shadow-[#17624a]/15 disabled:opacity-50"
          disabled={busy !== "" || !online}
          onClick={() => void perform()}
          type="button"
        >
          {busy.endsWith(action) ? "Сохраняем…" : labels[action]}
        </button>
      ) : null}
      {status === "DELIVERY_FAILED" ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center font-bold text-amber-900">
          Ожидайте решения оператора
        </p>
      ) : null}
      {action ? (
        <button
          className="min-h-12 w-full rounded-2xl border border-[#b9cdc3] bg-white px-5 py-3 font-bold text-[#315c4c] disabled:opacity-50"
          disabled={busy !== ""}
          onClick={shareLocation}
          type="button"
        >
          {busy === "location" ? "Отправляем…" : "Передать геопозицию"}
        </button>
      ) : null}
      {action && status !== "ASSIGNED" ? (
        <button
          className="w-full rounded-2xl px-5 py-3 text-sm font-bold text-red-700"
          onClick={() => setShowFailure((value) => !value)}
          type="button"
        >
          Не удалось доставить
        </button>
      ) : null}
      {showFailure ? (
        <div className="space-y-3 rounded-2xl border border-red-100 bg-red-50 p-4">
          <label className="block text-sm font-bold">
            Причина
            <select
              className="mt-2 w-full rounded-xl border bg-white px-3 py-3"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            >
              <option value="RECIPIENT_UNAVAILABLE">
                Получатель отсутствует
              </option>
              <option value="WRONG_ADDRESS">Неверный адрес</option>
              <option value="RECIPIENT_REFUSED">Получатель отказался</option>
              <option value="CANNOT_CONTACT">Не удалось связаться</option>
              <option value="ACCESS_PROBLEM">Нет доступа к адресу</option>
              <option value="OTHER">Другое</option>
            </select>
          </label>
          <textarea
            className="min-h-24 w-full rounded-xl border bg-white p-3"
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Комментарий для operations"
            value={note}
          />
          <button
            className="w-full rounded-xl bg-red-700 px-4 py-3 font-bold text-white disabled:opacity-50"
            disabled={busy !== "" || (reason === "OTHER" && !note.trim())}
            onClick={() => void reportFailure()}
            type="button"
          >
            Сообщить о проблеме
          </button>
        </div>
      ) : null}
      {showDeliveryCode ? (
        <div
          aria-labelledby="delivery-code-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
          role="dialog"
        >
          <div className="w-full rounded-t-3xl bg-white p-6 shadow-2xl sm:max-w-sm sm:rounded-3xl">
            <h2 className="text-xl font-black" id="delivery-code-title">
              Код получателя
            </h2>
            <p className="mt-2 text-sm text-[#5d6b65]">
              Попросите получателя назвать 6-значный код из SMS. Код не
              отображается курьеру нигде в приложении.
            </p>
            <input
              autoComplete="one-time-code"
              autoFocus
              className="mt-5 w-full rounded-2xl border-2 border-[#8ebca8] px-4 py-4 text-center text-3xl font-black tracking-[.35em]"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) =>
                setDeliveryCode(
                  event.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              pattern="[0-9]{6}"
              value={deliveryCode}
            />
            {error ? (
              <p
                className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                className="rounded-xl border px-4 py-3 font-bold"
                disabled={busy !== ""}
                onClick={() => setShowDeliveryCode(false)}
                type="button"
              >
                Назад
              </button>
              <button
                className="rounded-xl bg-[#17624a] px-4 py-3 font-bold text-white disabled:opacity-50"
                disabled={busy !== "" || deliveryCode.length !== 6}
                onClick={() => void confirmDeliveryWithCode()}
                type="button"
              >
                {busy ? "Проверяем…" : "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <p
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
