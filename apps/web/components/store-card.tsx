import Image from "next/image";
import Link from "next/link";
import { ArrowIcon, StarIcon } from "./icons";
type StoreCardData = {
  _count: { products: number };
  coverImageObjectKey: string | null;
  defaultPreparationMinutes: number;
  description: string;
  isOpen: boolean;
  logoObjectKey: string | null;
  name: string;
  ratingAverage: string;
  ratingCount: number;
  slug: string;
};
export function StoreCard({ store }: { store: StoreCardData }) {
  return (
    <Link
      className="group min-w-[285px] overflow-hidden rounded-[1.5rem] border border-[#eadfda] bg-white transition hover:-translate-y-1 hover:shadow-xl hover:shadow-[#6c3a4a]/10"
      href={`/store/${store.slug}`}
    >
      <div className="relative h-36 bg-[#eee4df]">
        {store.coverImageObjectKey ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="320px"
            src={store.coverImageObjectKey}
          />
        ) : null}
        <span
          className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-semibold ${store.isOpen ? "bg-white text-[#426b50]" : "bg-[#3b3432] text-white"}`}
        >
          {store.isOpen ? "Открыто" : "Откроется позже"}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{store.name}</h3>
            <div className="mt-1 flex items-center gap-1 text-xs text-[#756865]">
              <StarIcon className="h-3.5 w-3.5 text-[#d6964d]" />
              <span className="font-semibold text-[#4b3d39]">
                {store.ratingAverage}
              </span>
              <span>· {store._count.products} товаров</span>
            </div>
          </div>
          <ArrowIcon className="h-5 w-5 transition group-hover:translate-x-1" />
        </div>
        <p className="mt-3 line-clamp-2 text-sm leading-5 text-[#756865]">
          {store.description}
        </p>
        <p className="mt-3 text-xs font-medium text-[#8f2d56]">
          Подготовка от {store.defaultPreparationMinutes} мин
        </p>
      </div>
    </Link>
  );
}
