import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Extend Express Request type to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches userId to request
 */
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Get token from cookie or Authorization header
    let token = req.cookies.token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      res.status(401).json({
        success: false,
        message: "No token provided",
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Attach userId to request
    req.userId = decoded.userId;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};
