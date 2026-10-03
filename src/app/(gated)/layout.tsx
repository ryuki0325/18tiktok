import { viewerContext } from "@/lib/viewer";

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await viewerContext();
  return <main className="shell">{children}</main>;
}
