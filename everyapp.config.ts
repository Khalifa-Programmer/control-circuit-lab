import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "control-circuit-lab",
  name: "Control Circuit Lab",
  description:
    "Draw electrical control and power circuits, simulate them live with protection and PLC ladder logic, and share them with your team.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
  },
});
