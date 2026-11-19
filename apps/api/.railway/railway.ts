import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "inkypos_og";
export default defineRailway(() => {
  const inkypos_og = service("inkypos_og", {
    source: github("ctcyrex29/inkypos_og", { branch: "main", checkSuites: false, rootDirectory: "/apps/api" }),
    build: { buildEnvironment: "V3", builder: "RAILPACK" },
    healthcheck: "/api/v1/health",
    healthcheckTimeout: 120,
    preDeploy: "php artisan migrate --force",
    replicas: { "sfo": 1 },
    networking: { privateNetworkEndpoint: "inkyposog" },
  });

  return project("cozy-encouragement", {
    variables: { managed: false },
    resources: [inkypos_og],
  });
});
