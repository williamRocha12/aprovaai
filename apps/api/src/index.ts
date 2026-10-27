// API do AprovaAI como biblioteca: o Next (apps/web) a executa dentro de app/api/[...path].
export { buildApp, type AppDeps } from "./app";
export { loadConfig, type AppConfig } from "./config";
export { handleFetchRequest } from "./fetch-adapter";
export { getApi } from "./runtime";
