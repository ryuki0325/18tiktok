import { redirect } from "next/navigation";

/** 保存した動画はマイページのタブに移した */
export default function Favorites() {
  redirect("/me?tab=saved");
}
