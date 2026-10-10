/** Shared bag filled by server modules during bootstrap. */
import { createServerApiBag, type ServerApi } from "./server-api";

const api: ServerApi = createServerApiBag();

export = api;
