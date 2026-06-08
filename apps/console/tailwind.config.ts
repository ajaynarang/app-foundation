import type { Config } from "tailwindcss";
import uiPreset from "@sally/ui/tailwind-preset";

const config: Config = {
  presets: [uiPreset as Config],
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  plugins: [require("tailwindcss-animate")],
};

export default config;
