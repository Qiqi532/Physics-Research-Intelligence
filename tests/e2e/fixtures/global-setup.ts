import { deployE2eMigrations, removeE2eMasterKey, resetE2eData } from "./database";

export default async function globalSetup() {
  deployE2eMigrations();
  await removeE2eMasterKey();
  await resetE2eData();
}
