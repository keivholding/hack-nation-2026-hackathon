import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { AuthRepository } from "./auth.repository.js";
import type { NewUser, User } from "../../infra/db/schemas/users.js";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface RegisterDTO {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, "password">;
  token: string;
}

export class AuthService {
  private authRepository: AuthRepository;

  constructor() {
    this.authRepository = new AuthRepository();
  }

  /**
   * Register a new user
   */
  async register(data: RegisterDTO): Promise<AuthResponse> {
    // Check if passwords match
    if (data.password !== data.confirmPassword) {
      throw new Error("Passwords do not match");
    }

    // Check if user already exists
    const existingUser = await this.authRepository.findUserByEmail(data.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user
    const newUser: NewUser = {
      email: data.email,
      password: hashedPassword,
    };

    const user = await this.authRepository.createUser(newUser);

    // Generate JWT token
    const token = this.generateToken(user.id);

    // Return user without password
    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  /**
   * Login user
   */
  async login(data: LoginDTO): Promise<AuthResponse> {
    // Find user by email
    const user = await this.authRepository.findUserByEmail(data.email);
    if (!user) {
      throw new Error("Invalid email or password");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    // Generate JWT token
    const token = this.generateToken(user.id);

    // Return user without password
    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId: string): Promise<Omit<User, "password">> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): { userId: string } {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      return decoded;
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }
}
