export const ENV = {
  NODE_ENV: process.env.NODE_ENV!,
  PORT: Number(process.env.PORT!),
  DATABASE_URL: process.env.DATABASE_URL!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
};
