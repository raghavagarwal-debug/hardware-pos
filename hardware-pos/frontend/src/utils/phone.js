export function formatWhatsAppNumber(rawPhone) {
  if (!rawPhone) return "";
  
  // 1. Strip all non-digit characters
  let cleaned = String(rawPhone).replace(/\D/g, "");
  
  // 2. Strip leading zeroes (e.g. 098765... or 0091...)
  cleaned = cleaned.replace(/^0+/, "");
  
  // 3. If it is exactly a 10-digit number, prepend 91 for India
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  
  return cleaned;
}
