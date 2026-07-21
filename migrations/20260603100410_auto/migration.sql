-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "image" TEXT,
    "handle" TEXT,
    "selectedRocket" TEXT NOT NULL DEFAULT 'rocket_1',
    "maxAltitude" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "totalStarsCollected" INTEGER NOT NULL DEFAULT 0,
    "totalFlights" INTEGER NOT NULL DEFAULT 0,
    "totalSurvivalTime" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT NOT NULL DEFAULT 'PLAYER'
);
INSERT INTO "new_User" ("handle", "id", "image", "maxAltitude", "name", "selectedRocket", "stars", "totalFlights", "totalStarsCollected", "totalSurvivalTime") SELECT "handle", "id", "image", "maxAltitude", "name", "selectedRocket", "stars", "totalFlights", "totalStarsCollected", "totalSurvivalTime" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
