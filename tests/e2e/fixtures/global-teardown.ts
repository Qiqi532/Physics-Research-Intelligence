import { clearE2eBusinessData } from "./database";

export default async function globalTeardown() {
  await clearE2eBusinessData();
}
