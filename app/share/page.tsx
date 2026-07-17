import ShareClient from "./ShareClient";

export const dynamic = "force-dynamic";

export default async function SharePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string; text?: string; title?: string }>;
}) {
  const sp = await searchParams;
  const shared = [sp.url, sp.text, sp.title].filter(Boolean).join(" ");
  return <ShareClient shared={shared} />;
}
