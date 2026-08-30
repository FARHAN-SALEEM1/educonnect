import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    // The integration suite shares one database; parallel files would race.
    fileParallelism: false,
    testTimeout: 20000,

    /**
     * The suite must never reach a real mail relay.
     *
     * Most of these specs create teachers, parents and registers, and every one
     * of those sends mail. The addresses are fixtures — `@test.edu` — so a
     * configured relay would be handed hundreds of undeliverable recipients per
     * run, which is how a sending account gets rate-limited and then suspended.
     * Before SMTP was configured this was harmless; the moment it was, it
     * stopped being.
     *
     * Empty host puts email.service.js in console mode, which is what the specs
     * that care about delivery already do for themselves — they spawn their own
     * process pointed at a local sink (see tests/helpers/smtp-sink.js).
     *
     * dotenv does not overwrite a variable that is already present, so this
     * wins over .env rather than racing it.
     */
    env: {
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
    },
    hookTimeout: 30000,
  },
});
