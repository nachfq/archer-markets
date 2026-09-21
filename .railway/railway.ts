import { defineRailway, github, project, service } from "railway/iac";

// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "archer-markets-frontend";

export default defineRailway(() => {
  const frontend = service("Dummy", {
    source: github("nachfq/archer-markets", { branch: "main" }),
    build: "npm ci && npm --prefix web ci && npm run sdk:build && npm --prefix web run build",
    start: "npm --prefix web run start",
    healthcheck: "/",
    healthcheckTimeout: 120,
    deploy: {
      restartPolicyMaxRetries: 3,
    },
  });
  return project("archer-markets", {
    resources: [frontend],
  });
});
