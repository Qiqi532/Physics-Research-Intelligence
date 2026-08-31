import { clearE2eBusinessData, removeE2eMasterKey } from "./database";

export default async function globalTeardown() {
  await clearE2eBusinessData();
  await removeE2eMasterKey();
}
