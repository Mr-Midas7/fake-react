import logoUrl from "@/assets/export-logo.png";

export const SHOP_EXPORT_NAME = "FAKE RIDER MOTORPARTS";
export const SHOP_OWNER_NAME = "JOEMAR TATO";

export async function getShopLogoDataUrl() {
  const response = await fetch(logoUrl);
  if (!response.ok) throw new Error("Could not load the shop logo for export.");

  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the shop logo."));
    reader.readAsDataURL(blob);
  });
}

export function formatBusinessTimestamp() {
  return new Date().toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
