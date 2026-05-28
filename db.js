import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Save user state (conversation step)
export async function setState(userId, state) {
  await redis.set(`state:${userId}`, JSON.stringify(state), { ex: 3600 });
}

export async function getState(userId) {
  const data = await redis.get(`state:${userId}`);
  return data ? (typeof data === "string" ? JSON.parse(data) : data) : null;
}

export async function clearState(userId) {
  await redis.del(`state:${userId}`);
}

// Save a reservation
export async function saveReservation(reservation) {
  const id = `RES-${Date.now()}`;
  const key = `reservation:${id}`;
  await redis.set(key, JSON.stringify({ ...reservation, id, status: "confirmed" }));
  // Add to the date index for easy lookup
  await redis.sadd(`reservations:${reservation.date}`, id);
  return id;
}

// Get all reservations for a date
export async function getReservationsByDate(date) {
  const ids = await redis.smembers(`reservations:${date}`);
  if (!ids || ids.length === 0) return [];
  const reservations = await Promise.all(
    ids.map((id) => redis.get(`reservation:${id}`))
  );
  return reservations
    .filter(Boolean)
    .map((r) => (typeof r === "string" ? JSON.parse(r) : r));
}

// Check if a table is available at a given date/time
export async function isTableAvailable(date, time, tableNumber) {
  const reservations = await getReservationsByDate(date);
  return !reservations.some(
    (r) => r.time === time && r.tableNumber === tableNumber && r.status !== "cancelled"
  );
}

// Find any available table for date/time/guests
export async function findAvailableTable(date, time, guests, totalTables) {
  const reservations = await getReservationsByDate(date);
  const takenTables = reservations
    .filter((r) => r.time === time && r.status !== "cancelled")
    .map((r) => r.tableNumber);

  for (let t = 1; t <= totalTables; t++) {
    if (!takenTables.includes(t)) return t;
  }
  return null;
}

// Cancel a reservation
export async function cancelReservation(reservationId) {
  const data = await redis.get(`reservation:${reservationId}`);
  if (!data) return false;
  const reservation = typeof data === "string" ? JSON.parse(data) : data;
  await redis.set(
    `reservation:${reservationId}`,
    JSON.stringify({ ...reservation, status: "cancelled" })
  );
  return true;
}

// Get reservation by ID
export async function getReservation(reservationId) {
  const data = await redis.get(`reservation:${reservationId}`);
  return data ? (typeof data === "string" ? JSON.parse(data) : data) : null;
}
