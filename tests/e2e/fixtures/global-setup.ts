import { deployE2eMigrations, resetE2eData } from "./database";

export default async function globalSetup() {
  deployE2eMigrations();
  await resetE2eData();
}
