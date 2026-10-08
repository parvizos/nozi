export default function CourierLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Загрузка courier workspace"
      className="space-y-4"
    >
      <div className="h-32 animate-pulse rounded-3xl bg-[#dfece6]" />
      <div className="h-8 w-56 animate-pulse rounded-xl bg-[#dfece6]" />
      <div className="h-56 animate-pulse rounded-3xl bg-white" />
    </div>
  );
}
