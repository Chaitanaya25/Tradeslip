export const metadata = { title: "Not found", robots: { index: false, follow: false } };

// Shown for any link that does not work. It says nothing about whether the link ever existed.
export default function PublicQuoteNotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col justify-center px-5 py-10">
      <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">This link isn&apos;t working</h1>
      <p className="mt-2 text-[17px] leading-6 text-text-muted">
        Check you copied the whole link, or ask the business to send it again.
      </p>
    </main>
  );
}
