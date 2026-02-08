import express, { Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import authRoutes from "./modules/auth/auth.routes.js";

const app = express();

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000", // Update with your frontend URL
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded images
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Basic route
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Welcome to the Express API",
    status: "success",
  });
});

// Health check route
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Auth routes
app.use("/auth", authRoutes);

export default app;
