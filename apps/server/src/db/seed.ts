import { db } from "./client.js";
import { teams } from "./schema.js";
import { hashPassword } from "../modules/auth/service.js";
import { users } from "./schema.js";
import { logger } from "../lib/logger.js";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    logger.info({ email }, "Seed admin user already exists, skipping");
  } else {
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      email,
      name: "Admin",
      passwordHash,
      isSuperAdmin: true,
    });
    logger.info({ email, password }, "Created seed super admin user (change this password immediately)");
  }

  const [existingTeam] = await db.select().from(teams).where(eq(teams.name, "Default Team")).limit(1);
  if (!existingTeam) {
    await db.insert(teams).values({ name: "Default Team" });
    logger.info("Created 'Default Team'");
  }

  logger.info("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
