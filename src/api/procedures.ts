import { db } from "@/api/db";
import { getAuth } from "@adaptive-ai/sdk/server";

async function _requireAdmin() {
  const { userId } = await getAuth({ required: true });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error("Access denied");
  }
  if ((user.role || "PLAYER") !== "ADMIN") {
    throw new Error("Access denied");
  }
  return { userId, user };
}

export async function getUserData() {
  const { userId } = await getAuth({ required: true });

  try {
    let user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await db.user.create({
        data: { id: userId, selectedRocket: "rocket_1" },
      });
    } else if (!user.selectedRocket) {
      user = await db.user.update({
        where: { id: userId },
        data: { selectedRocket: "rocket_1" },
      });
    }

    return user;
  } catch (err: any) {
    // If the database is temporarily unavailable, let the game still load with safe defaults.
    console.log(
      "[getUserData] Falling back to default user stats due to error:",
      err?.message || "unknown",
    );
    return {
      id: userId,
      name: null,
      handle: null,
      image: null,
      role: "PLAYER",
      selectedRocket: "rocket_1",
      maxAltitude: 0,
      stars: 0,
      totalStarsCollected: 0,
      totalFlights: 0,
      totalSurvivalTime: 0,
    };
  }
}

export async function getMyRole() {
  const { userId } = await getAuth({ required: true });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) {
    // If the row doesn't exist yet, treat as player.
    return { role: "PLAYER" };
  }

  return { role: user.role || "PLAYER" };
}

export async function adminListUsers(input?: {
  query?: string;
  limit?: number;
}) {
  await _requireAdmin();

  const q = (input?.query || "").trim();
  const limit = Math.max(1, Math.min(100, Math.round(input?.limit ?? 50)));

  const where = q
    ? {
        OR: [
          { id: { contains: q } },
          { name: { contains: q } },
          { handle: { contains: q } },
        ],
      }
    : undefined;

  const users = await db.user.findMany({
    where,
    take: limit,
    orderBy: [{ maxAltitude: "desc" }],
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
      role: true,
      selectedRocket: true,
      maxAltitude: true,
      stars: true,
      totalStarsCollected: true,
      totalFlights: true,
      totalSurvivalTime: true,
    },
  });

  return { users };
}

export async function adminResetUser(input: {
  userId: string;
  mode: "STARS_ONLY" | "STATS_ONLY" | "ALL";
}) {
  await _requireAdmin();

  const targetId = String(input.userId || "").trim();
  if (!targetId) throw new Error("Missing userId");

  const mode = input.mode;
  const data: any = {};

  if (mode === "STARS_ONLY") {
    data.stars = 0;
  } else if (mode === "STATS_ONLY") {
    data.maxAltitude = 0;
    data.totalStarsCollected = 0;
    data.totalFlights = 0;
    data.totalSurvivalTime = 0;
  } else if (mode === "ALL") {
    data.maxAltitude = 0;
    data.stars = 0;
    data.totalStarsCollected = 0;
    data.totalFlights = 0;
    data.totalSurvivalTime = 0;
  } else {
    throw new Error("Invalid reset mode");
  }

  const updated = await db.user.update({
    where: { id: targetId },
    data,
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
      role: true,
      selectedRocket: true,
      maxAltitude: true,
      stars: true,
      totalStarsCollected: true,
      totalFlights: true,
      totalSurvivalTime: true,
    },
  });

  return { user: updated };
}

export async function adminDeleteUser(input: { userId: string }) {
  const { userId: adminId } = await _requireAdmin();

  const targetId = String(input.userId || "").trim();
  if (!targetId) throw new Error("Missing userId");
  if (targetId === adminId) {
    throw new Error("You can’t delete your own account");
  }

  await db.user.delete({ where: { id: targetId } });
  return { deletedUserId: targetId };
}

// Internal setup: make the specified user an ADMIN.
export async function _setInitialAdmin(userId: string) {
  const id = String(userId || "").trim();
  if (!id) throw new Error("Missing userId");

  await db.user.upsert({
    where: { id },
    create: { id, role: "ADMIN", selectedRocket: "rocket_1" },
    update: { role: "ADMIN" },
  });

  return { ok: true };
}

export async function updateGameResult(input: {
  altitude?: number;
  starsCollected?: number;
  survivalTime?: number;
}) {
  const altitude = Number.isFinite(input?.altitude as any)
    ? Math.round(Number(input.altitude))
    : 0;
  const starsCollected = Number.isFinite(input?.starsCollected as any)
    ? Math.round(Number(input.starsCollected))
    : 0;
  const survivalTime = Number.isFinite(input?.survivalTime as any)
    ? Number(input.survivalTime)
    : 0;
  const { userId } = await getAuth({ required: true });

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      // Create on the fly so a run can still be saved even if the profile wasn't created yet.
      const created = await db.user.create({
        data: { id: userId, selectedRocket: "rocket_1" },
      });

      return created;
    }

    const newMaxAltitude = Math.max(user.maxAltitude, altitude);
    const newStars = user.stars + starsCollected;
    const newTotalStars = user.totalStarsCollected + starsCollected;
    const newTotalFlights = user.totalFlights + 1;
    const newTotalSurvivalTime =
      user.totalSurvivalTime + Math.round(survivalTime);

    // Update user's stats
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: {
        maxAltitude: newMaxAltitude,
        stars: newStars,
        totalStarsCollected: newTotalStars,
        totalFlights: newTotalFlights,
        totalSurvivalTime: newTotalSurvivalTime,
      },
    });

    return updatedUser;
  } catch (err: any) {
    console.log(
      "[updateGameResult] Failed to save run; returning safe response:",
      err?.message || "unknown",
    );

    // Return a safe object so the client doesn't crash.
    return {
      id: userId,
      name: null,
      selectedRocket: "rocket_1",
      maxAltitude: Math.max(0, Math.round(altitude)),
      stars: Math.max(0, Math.round(starsCollected)),
      totalStarsCollected: Math.max(0, Math.round(starsCollected)),
      totalFlights: 1,
      totalSurvivalTime: Math.max(0, Math.round(survivalTime)),
    };
  }
}

// Power-up and shop endpoints were removed to keep the experience focused on simple, endless flight.

// Leaderboard functionality has been fully removed from the game to focus on core solo gameplay.

// One-time cleanup to remove legacy Rocket/UserRocket tables
export async function _cleanupRocketTables() {
  try {
    const tables =
      (await db.$queryRaw<
        Array<{ name: string }>
      >`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Rocket','UserRocket')`) ||
      [];
    const names = new Set(tables.map((t) => t.name));

    const dropped: string[] = [];
    const skipped: string[] = [];

    if (names.has("UserRocket")) {
      await db.$executeRawUnsafe('DROP TABLE IF EXISTS "UserRocket"');
      dropped.push("UserRocket");
    } else {
      skipped.push("UserRocket");
    }

    if (names.has("Rocket")) {
      await db.$executeRawUnsafe('DROP TABLE IF EXISTS "Rocket"');
      dropped.push("Rocket");
    } else {
      skipped.push("Rocket");
    }

    return { dropped, skipped };
  } catch (err) {
    console.error("[Cleanup] Failed to drop Rocket/UserRocket tables", err);
    throw err;
  }
}
