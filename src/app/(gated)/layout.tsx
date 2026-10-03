import { viewerContext } from "@/lib/viewer";
import { DesktopQr } from "@/components/DesktopQr";

export default async function GatedLayout({ children }: { children: React.ReactNode }) {
  await viewerContext();
  return (
    <>
      <main className="shell">{children}</main>
      <DesktopQr />
    </>
  );
}
