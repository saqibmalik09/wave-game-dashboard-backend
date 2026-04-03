import {
    Injectable,
    UnauthorizedException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../common/database.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface User {
    id: number;
    username: string;
    email: string;
    password: string;
    full_name: string | null;
    is_active: boolean;
}

interface UserWithRolesAndPermissions {
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    roles: string[];
    permissions: string[];
}

@Injectable()
export class AuthService {
    constructor(
        private databaseService: DatabaseService,
        private jwtService: JwtService,
        private configService: ConfigService,
    ) { }

    async register(registerDto: RegisterDto) {
        // Check if username already exists
        const existingUser = await this.databaseService.queryOne<User>(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [registerDto.username, registerDto.email],
        );

        if (existingUser) {
            throw new ConflictException('Username or email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(registerDto.password, 10);

        // Insert user
        const result = await this.databaseService.execute(
            `INSERT INTO users (username, email, password, full_name) VALUES (?, ?, ?, ?)`,
            [
                registerDto.username,
                registerDto.email,
                hashedPassword,
                registerDto.full_name || null,
            ],
        );

        const userId = result.insertId;

        return {
            success: true,
            message: 'User registered successfully',
            data: {
                id: userId,
                username: registerDto.username,
                email: registerDto.email,
            },
        };
    }

    async login(loginDto: LoginDto) {
        // Find user by username
        const user = await this.databaseService.queryOne<User>(
            'SELECT * FROM users WHERE username = ?',
            [loginDto.username],
        );

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.is_active) {
            throw new UnauthorizedException('Account is inactive');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(
            loginDto.password,
            user.password,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Get user with roles and permissions
        const userWithPermissions = await this.getUserWithPermissions(user.id);

        // Generate tokens
        const tokens = await this.generateTokens(user);

        return {
            success: true,
            data: {
                ...tokens,
                user: userWithPermissions,
            },
        };
    }

    async refreshToken(refreshToken: string) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            });

            const user = await this.databaseService.queryOne<User>(
                'SELECT * FROM users WHERE id = ?',
                [payload.sub],
            );

            if (!user || !user.is_active) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            const accessToken = this.jwtService.sign(
                {
                    sub: user.id,
                    username: user.username,
                    email: user.email,
                },
                {
                    secret: this.configService.get<string>('JWT_SECRET'),
                    expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
                },
            );

            return {
                success: true,
                data: {
                    access_token: accessToken,
                },
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async getUserWithPermissions(
        userId: number,
    ): Promise<UserWithRolesAndPermissions> {
        // Get user info
        const user = await this.databaseService.queryOne<User>(
            'SELECT id, username, email, full_name FROM users WHERE id = ?',
            [userId],
        );

        if (!user) {
            throw new BadRequestException('User not found');
        }

        // Get user roles
        const roles = await this.databaseService.query<{ name: string }>(`
      SELECT r.name
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `, [userId]);

        // Get user permissions
        const permissions = await this.databaseService.query<{ name: string }>(`
      SELECT DISTINCT p.name
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?
    `, [userId]);

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            roles: roles.map((r) => r.name),
            permissions: permissions.map((p) => p.name),
        };
    }

    private async generateTokens(user: User) {
        const payload = {
            sub: user.id,
            username: user.username,
            email: user.email,
        };

        const accessToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1h'),
        });

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
        });

        return {
            access_token: accessToken,
            refresh_token: refreshToken,
        };
    }
}
