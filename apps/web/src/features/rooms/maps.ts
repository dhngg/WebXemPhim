import type { PublicRoom } from './types';

/**
 * Chỉ đường bằng liên kết Google Maps (quyết định V1): KHÔNG nhúng bản đồ, KHÔNG dùng Maps JavaScript/Directions API,
 * không cần API key và không tự tính khoảng cách/thời gian. Điểm ĐẾN là địa chỉ do backend trả; điểm xuất phát để
 * Google Maps hỏi người dùng.
 */
const DIRECTIONS = 'https://www.google.com/maps/dir/';

/**
 * Địa chỉ đủ rõ để định vị căn nhà: backend trả `building.addressLine1` (số nhà/đường) và `city`.
 * Chỉ có thành phố hoặc quận thì KHÔNG đủ → trả `null` (không hiện nút như thể vị trí là chính xác).
 * Không bịa địa chỉ hay lấy tâm quận/thành phố làm vị trí phòng.
 */
export function directionsDestination(room: Pick<PublicRoom, 'address' | 'streetAddress' | 'city'>): string | null {
  const street = room.streetAddress?.trim();
  const city = room.city?.trim();
  const address = room.address?.trim();
  if (!street || !city || !address) return null;
  return `${address}, Việt Nam`;
}

export function googleMapsDirectionsUrl(room: Pick<PublicRoom, 'address' | 'streetAddress' | 'city'>): string | null {
  const destination = directionsDestination(room);
  return destination ? `${DIRECTIONS}?api=1&destination=${encodeURIComponent(destination)}` : null;
}
