export const fmt = (n: number) => (n >= 10000 ? (Math.round(n / 1000) / 10).toString().replace(/\.0$/, "") + "万" : n.toLocaleString("ja-JP"));

export function ago(iso: string | Date | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "たった今";
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}
