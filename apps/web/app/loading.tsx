export default function Loading() {
  return (
    <main
      className="mx-auto min-h-screen max-w-7xl animate-pulse px-4 py-10 sm:px-6 lg:px-8"
      aria-label="Загрузка"
    >
      <div className="h-8 w-32 rounded-full bg-[#eadfda]" />
      <div className="mt-8 h-56 rounded-[2rem] bg-[#eee5e0]" />
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index}>
            <div className="aspect-[4/5] rounded-3xl bg-[#eee5e0]" />
            <div className="mt-3 h-4 rounded bg-[#eadfda]" />
          </div>
        ))}
      </div>
    </main>
  );
}
