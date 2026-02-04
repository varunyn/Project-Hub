import type { IStaticMethods } from "preline";

declare global {
  interface Window {
    HSStaticMethods: IStaticMethods;
  }
}
