/* eslint-disable no-console */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ENV } from "../../config/env.js";

import * as schemas from "./schemas/index.js";

const client = postgres(ENV.DATABASE_URL, { prepare: false });
export const db = drizzle({ client, schema: schemas });
