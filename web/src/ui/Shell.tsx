export function Shell({ title, text, children }: { readonly title: string; readonly text: string; readonly children?: React.ReactNode }) {
  return (
    <main className="grid h-full place-items-center bg-[radial-gradient(120%_80%_at_50%_0%,#2a8db6,#0b2230_70%)] px-4 text-center">
      <div className="grid justify-items-center gap-3">
        <h1 className="m-0 font-display text-5xl font-bold">{title}</h1>
        <p className="m-0 max-w-sm text-muted">{text}</p>
        {children}
      </div>
    </main>
  );
}
