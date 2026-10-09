export type TemplateInputMap = {
  OTP_CODE: { code: string; expiresMinutes: number };
  NEW_ORDER_SELLER: { amount: string; orderNumber: string };
  ORDER_CREATED: { orderNumber: string };
  ORDER_CONFIRMED: { orderNumber: string };
  ORDER_PREPARING: { orderNumber: string };
  COURIER_ASSIGNED: { orderNumber: string };
  COURIER_ON_THE_WAY: { orderNumber: string };
  ORDER_DELIVERED: { orderNumber: string };
  ORDER_CANCELLED: { orderNumber: string };
  DELIVERY_ASSIGNED: { orderNumber: string; storeName: string };
  DELIVERY_REASSIGNED: { orderNumber: string; storeName: string };
  DELIVERY_CANCELLED: { orderNumber: string };
  RECIPIENT_ON_THE_WAY: { orderNumber: string };
  DELIVERY_CODE: { code: string; orderNumber: string };
  DELIVERY_FAILED_ADMIN: { orderNumber: string };
  COURIER_INVITED: Record<string, never>;
};

export type TemplateName = keyof TemplateInputMap;

export function renderTemplate<T extends TemplateName>(
  name: T,
  input: TemplateInputMap[T],
): { body: string; title: string } {
  switch (name) {
    case "OTP_CODE": {
      const value = input as TemplateInputMap["OTP_CODE"];
      return {
        body: `Код NOZI: ${value.code}. Действует ${value.expiresMinutes} мин. Никому не сообщайте код.`,
        title: "Код входа NOZI",
      };
    }
    case "NEW_ORDER_SELLER": {
      const value = input as TemplateInputMap["NEW_ORDER_SELLER"];
      return {
        body: `Новый заказ ${value.orderNumber} на ${value.amount}. Откройте кабинет продавца.`,
        title: "Новый заказ",
      };
    }
    case "ORDER_CREATED":
      return orderTemplate(
        input as TemplateInputMap["ORDER_CREATED"],
        "Заказ создан",
        "Создан заказ",
      );
    case "ORDER_CONFIRMED":
      return orderTemplate(
        input as TemplateInputMap["ORDER_CONFIRMED"],
        "Заказ принят",
        "Магазин принял заказ",
      );
    case "ORDER_PREPARING":
      return orderTemplate(
        input as TemplateInputMap["ORDER_PREPARING"],
        "Заказ готовится",
        "Магазин готовит заказ",
      );
    case "COURIER_ASSIGNED":
      return orderTemplate(
        input as TemplateInputMap["COURIER_ASSIGNED"],
        "Курьер назначен",
        "На заказ назначен курьер:",
      );
    case "COURIER_ON_THE_WAY":
      return orderTemplate(
        input as TemplateInputMap["COURIER_ON_THE_WAY"],
        "Курьер в пути",
        "Курьер уже в пути с заказом",
      );
    case "ORDER_DELIVERED":
      return orderTemplate(
        input as TemplateInputMap["ORDER_DELIVERED"],
        "Заказ доставлен",
        "Доставлен заказ",
      );
    case "ORDER_CANCELLED":
      return orderTemplate(
        input as TemplateInputMap["ORDER_CANCELLED"],
        "Заказ отменён",
        "Отменён заказ",
      );
    case "DELIVERY_ASSIGNED": {
      const value = input as TemplateInputMap["DELIVERY_ASSIGNED"];
      return {
        body: `Вам назначена доставка ${value.orderNumber} из магазина «${value.storeName}».`,
        title: "Новая доставка",
      };
    }
    case "DELIVERY_REASSIGNED": {
      const value = input as TemplateInputMap["DELIVERY_REASSIGNED"];
      return {
        body: `Вам переназначена доставка ${value.orderNumber} из «${value.storeName}».`,
        title: "Доставка переназначена",
      };
    }
    case "DELIVERY_CANCELLED": {
      const value = input as TemplateInputMap["DELIVERY_CANCELLED"];
      return {
        body: `Назначение по заказу ${value.orderNumber} отменено.`,
        title: "Доставка отменена",
      };
    }
    case "DELIVERY_CODE": {
      const value = input as TemplateInputMap["DELIVERY_CODE"];
      return {
        body: `Код получения заказа ${value.orderNumber}: ${value.code}. Сообщите его курьеру только при получении.`,
        title: "Код получения",
      };
    }
    case "RECIPIENT_ON_THE_WAY": {
      const value = input as TemplateInputMap["RECIPIENT_ON_THE_WAY"];
      return {
        body: `Курьер уже в пути с заказом ${value.orderNumber}. Код получения придёт отдельным сообщением.`,
        title: "Курьер в пути",
      };
    }
    case "DELIVERY_FAILED_ADMIN": {
      const value = input as TemplateInputMap["DELIVERY_FAILED_ADMIN"];
      return {
        body: `Доставка ${value.orderNumber} не удалась и требует решения оператора.`,
        title: "Требуется внимание",
      };
    }
    case "COURIER_INVITED":
      return {
        body: "Вас пригласили стать курьером NOZI. Откройте NOZI, введите этот номер телефона и подтвердите вход кодом из SMS.",
        title: "Приглашение курьера",
      };
  }
}

function orderTemplate(
  input:
    | TemplateInputMap["ORDER_CONFIRMED"]
    | TemplateInputMap["ORDER_CREATED"]
    | TemplateInputMap["ORDER_PREPARING"]
    | TemplateInputMap["COURIER_ASSIGNED"]
    | TemplateInputMap["COURIER_ON_THE_WAY"]
    | TemplateInputMap["ORDER_DELIVERED"]
    | TemplateInputMap["ORDER_CANCELLED"],
  title: string,
  prefix: string,
) {
  return { body: `${prefix} ${input.orderNumber}.`, title };
}
