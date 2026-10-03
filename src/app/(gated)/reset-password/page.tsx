import { NavBar } from "@/components/NavBar";
import { ResetForm } from "./Form";

export const metadata = { title: "新しいパスワード" };

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="screen">
      <NavBar title="新しいパスワード" back="/login" />
      <div className="sec" style={{ gap: 16, paddingTop: 12 }}><ResetForm token={token ?? ""} /></div>
    </div>
  );
}
