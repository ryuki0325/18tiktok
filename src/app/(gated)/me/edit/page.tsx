import { redirect } from "next/navigation";
import { viewerContext } from "@/lib/viewer";
import { NavBar } from "@/components/NavBar";
import { EditProfileForm } from "./EditProfileForm";

export const metadata = { title: "プロフィールを編集" };

export default async function EditProfile() {
  const ctx = await viewerContext();
  const u = ctx.user;
  if (!u) redirect("/login?next=/me/edit");
  return (
    <div className="screen">
      <NavBar title="プロフィールを編集" back="/me" />
      <EditProfileForm u={{ handle: u.handle, displayName: u.displayName, bio: u.bio, avatarHue: u.avatarHue, avatarUrl: u.avatarUrl }} />
    </div>
  );
}
