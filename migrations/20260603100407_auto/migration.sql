-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "image" TEXT,
    "handle" TEXT,
    "selectedRocket" TEXT NOT NULL DEFAULT 'rocket_1',
    "maxAltitude" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "totalStarsCollected" INTEGER NOT NULL DEFAULT 0,
    "totalFlights" INTEGER NOT NULL DEFAULT 0,
    "totalSurvivalTime" INTEGER NOT NULL DEFAULT 0
);
