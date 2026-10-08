export default function AdminLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Загрузка панели администратора"
      className="space-y-5"
    >
      <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            className="h-28 animate-pulse rounded-2xl bg-white"
            key={index}
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
