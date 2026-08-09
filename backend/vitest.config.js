import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // The integration suite shares one database; parallel files would race.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
